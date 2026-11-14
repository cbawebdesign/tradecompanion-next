import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Alert } from '../types'
import { useStore, defaultConfig } from '../store/useStore'
import {
  applyRemoteMessage, buildSnapshot, deletionKeys, addRemovedKeys, setTimelineActionListener,
  REMOVED_KEYS_CAP, type TimelineMessage, type TimelineState, type LocalTimelineAction,
} from '../lib/timelineSync'
import { createTimelineSyncClient, ESTABLISHED_AFTER_MS, SNAPSHOT_WINDOW_MS } from '../lib/timelineSyncClient'

// ── fixtures ────────────────────────────────────────────────────────────────
const T0 = new Date('2026-11-13T14:00:00Z').getTime()
const min = (n: number) => new Date(T0 + n * 60_000)
let seq = 0
const mk = (p: Partial<Alert> & Pick<Alert, 'symbol' | 'type' | 'message'>): Alert => ({
  id: `id-${++seq}`, color: '#fff', timestamp: min(0), read: false, ...p,
})
const tv = (n: number, msg: string, at: number) => mk({ symbol: 'ARAI', type: 'tradingview', message: msg, dedupKey: `tv:${n}`, timestamp: min(at) })
const cat = (rid: string, sym: string, title: string, at: number) => mk({ symbol: sym, type: 'catalyst', message: title, dedupKey: `cat:rid:${rid}`, timestamp: min(at) })
// Trade Exchange: the live frame falls back to Date.now() for its id, so the
// same post carries a different dedupKey on each copy.
const tx = (sym: string, msg: string, at: number) => mk({ symbol: sym, type: 'trade_exchange', message: msg, dedupKey: `tx:${Math.random()}`, timestamp: min(at) })

const empty = (): TimelineState => ({ alerts: [], hiddenAlertIds: new Set(), removedAlertKeys: new Set(), clearedSince: null })
const visible = (s: TimelineState) => s.alerts.filter((a) => !s.hiddenAlertIds.has(a.id))
/** Compare timelines by what the user sees, not by local ids. */
const view = (s: TimelineState) => visible(s).map((a) => `${a.symbol}|${a.type}|${a.message}`)

// ── two copies of one login, wired through a fake relay ─────────────────────
// The relay mirrors the worker: Clients.User(login) — every open copy,
// including the one that posted.
function harness() {
  let now = T0
  const copies: Array<{ client: ReturnType<typeof createTimelineSyncClient>; state: TimelineState }> = []
  const sent: TimelineMessage[] = []
  const relay = (msg: TimelineMessage) => {
    sent.push(msg)
    // Round-trip through JSON exactly as the worker forwards the body.
    const wire = JSON.stringify(msg)
    for (const c of copies) c.client.onMessage(wire)
  }
  const open = (name: string, initial: TimelineState = empty()) => {
    const copy = { state: initial } as (typeof copies)[number]
    copy.client = createTimelineSyncClient({
      instanceId: name,
      now: () => now,
      send: relay,
      getState: () => copy.state,
      apply: (msg) => { copy.state = { ...copy.state, ...applyRemoteMessage(copy.state, msg) } },
    })
    copies.push(copy)
    return copy
  }
  return { open, sent, advance: (ms: number) => { now += ms }, now: () => now }
}

describe('a copy that opens takes the running copy\'s timeline', () => {
  it('matches it — including what was deleted and where Clear All was drawn', () => {
    const h = harness()
    // Desktop has been open all morning. It cleared at 9:00 (min 0), then:
    const deletedNews = tx('HUBC', '[TX-News1] HUBC announces partnership', 20)
    const desktopAlerts = [
      tv(1, 'ARAI crossed VWAP', 30),
      cat('r1', 'AIMD', 'AIMD wins FDA nod', 25),
      deletedNews,
      tv(2, 'ARAI crossed VWAP', 40), // same setup firing again later
    ]
    const desktop = h.open('desktop', {
      alerts: desktopAlerts,
      hiddenAlertIds: new Set([deletedNews.id]),
      removedAlertKeys: new Set(deletionKeys(deletedNews)),
      clearedSince: min(0).getTime(),
    })
    h.advance(ESTABLISHED_AFTER_MS + 60_000)

    // The laptop opens. Its own backfill has already brought in: the TV alert
    // (different local id, same server id), the deleted TX post (different
    // dedupKey — TX ids are not stable), and a scan from BEFORE the clear.
    const laptop = h.open('laptop', {
      ...empty(),
      alerts: [
        tv(1, 'ARAI crossed VWAP', 30),
        tx('HUBC', 'HUBC announces partnership', 20),
        mk({ symbol: 'ZZZ', type: 'scanner', message: '▲ 40% intraday', dedupKey: 'gain:ZZZ', timestamp: min(-30) }),
      ],
    })
    laptop.client.onConnected('connect')

    expect(view(laptop.state).sort()).toEqual(view(desktop.state).sort())
    expect(view(laptop.state)).toHaveLength(3)
    // Both TradingView firings survive — they repeat legitimately.
    expect(visible(laptop.state).filter((a) => a.type === 'tradingview')).toHaveLength(2)
    expect(laptop.state.clearedSince).toBe(min(0).getTime())
  })

  it('a deleted alert that the backfill brings in LATER stays hidden (store, any order)', () => {
    const deleted = cat('r9', 'AIMD', 'AIMD reports Q3 results', 10)
    useStore.setState({ alerts: [], hiddenAlertIds: new Set(), removedAlertKeys: new Set(), clearedSince: null,
      flaggedSymbols: new Set(['AIMD', 'ARAI']), alertSubscriptions: [], hasMigratedSubs: true, config: { ...defaultConfig } } as any)

    // The snapshot lands first…
    useStore.getState().applyRemoteTimeline({
      v: 1, kind: 'snapshot', from: 'desktop', to: 'laptop',
      alerts: [], removedKeys: deletionKeys(deleted), clearedSince: min(0).getTime(),
    })
    // …then the backfill resolves.
    useStore.getState().addAlerts([
      { ...deleted, id: 'backfilled' },
      cat('r10', 'ARAI', 'ARAI prices offering', 15),
      cat('r11', 'ARAI', 'ARAI old news before the clear', -5),
    ])

    const s = useStore.getState()
    const shown = s.alerts.filter((a) => !s.hiddenAlertIds.has(a.id)).map((a) => a.message)
    expect(shown).toEqual(['ARAI prices offering'])
    // Still there for the AIMD data ribbon, just not on the timeline.
    expect(s.alerts.some((a) => a.id === 'backfilled')).toBe(true)
  })

  it('with nobody else open, nothing answers and nothing changes', () => {
    const h = harness()
    const only = h.open('only', { ...empty(), alerts: [tv(1, 'x', 1)] })
    only.client.onConnected('connect')
    expect(h.sent.map((m) => m.kind)).toEqual(['hello'])
    expect(view(only.state)).toEqual(['ARAI|tradingview|x'])
  })

  it('a copy that just opened does not answer for the timeline', () => {
    const h = harness()
    const a = h.open('a', { ...empty(), alerts: [tv(1, 'x', 1)] })
    const b = h.open('b')
    b.client.onConnected('connect')
    expect(h.sent.map((m) => m.kind)).toEqual(['hello'])
    expect(view(b.state)).toEqual([])
    expect(view(a.state)).toEqual(['ARAI|tradingview|x'])
  })

  it('three copies: the newcomer merges both answers, the others ignore a snapshot not meant for them', () => {
    const h = harness()
    const a = h.open('a', { ...empty(), alerts: [tv(1, 'x', 1)] })
    const b = h.open('b', { ...empty(), alerts: [tv(1, 'x', 1), tv(2, 'y', 2)] })
    h.advance(ESTABLISHED_AFTER_MS)
    const c = h.open('c')
    c.client.onConnected('connect')
    expect(h.sent.filter((m) => m.kind === 'snapshot')).toHaveLength(2)
    expect(view(c.state).sort()).toEqual(['ARAI|tradingview|x', 'ARAI|tradingview|y'])
    expect(view(a.state)).toEqual(['ARAI|tradingview|x'])
  })

  it('a snapshot arriving long after the hello is ignored', () => {
    const late = createTimelineSyncClient({
      instanceId: 'me', now: () => T0 + SNAPSHOT_WINDOW_MS + 1, send: () => {}, getState: empty, apply: () => { throw new Error('applied') },
    })
    expect(() => late.onMessage({ v: 1, kind: 'snapshot', from: 'x', to: 'me', alerts: [], removedKeys: [], clearedSince: null })).not.toThrow()
  })
})

describe('deletes, hides and Clear All follow every open copy', () => {
  function pair() {
    const h = harness()
    const shared = () => [tv(1, 'ARAI crossed VWAP', 30), tx('HUBC', 'HUBC partnership', 20), cat('r1', 'AIMD', 'AIMD wins FDA nod', 25)]
    const a = h.open('a', { ...empty(), alerts: shared() })
    const b = h.open('b', { ...empty(), alerts: shared() })
    return { h, a, b }
  }

  it('delete on one hides it on the other — matched by content when ids differ', () => {
    const { a, b } = pair()
    const target = a.state.alerts.find((x) => x.type === 'trade_exchange')!
    a.client.onLocalAction({ kind: 'remove', keys: deletionKeys(target) })
    expect(view(b.state)).not.toContain('HUBC|trade_exchange|HUBC partnership')
    expect(view(b.state)).toHaveLength(2)
  })

  it('deleting one TradingView firing does not hide a later firing of the same setup', () => {
    const h = harness()
    const a = h.open('a', { ...empty(), alerts: [tv(1, 'ARAI crossed VWAP', 30), tv(2, 'ARAI crossed VWAP', 40)] })
    const b = h.open('b', { ...empty(), alerts: [tv(1, 'ARAI crossed VWAP', 30), tv(2, 'ARAI crossed VWAP', 40)] })
    a.client.onLocalAction({ kind: 'remove', keys: deletionKeys(a.state.alerts[0]) })
    expect(visible(b.state).map((x) => x.dedupKey)).toEqual(['tv:2'])
  })

  it('Clear All clears the other copy, but keeps an alert that landed after the click', () => {
    const { h, a, b } = pair()
    const at = min(35).getTime()
    b.state = { ...b.state, alerts: [mk({ symbol: 'NEW', type: 'catalyst', message: 'fresh', timestamp: min(35.01) }), ...b.state.alerts] }
    a.client.onLocalAction({ kind: 'clear', at })
    expect(view(b.state)).toEqual(['NEW|catalyst|fresh'])
    expect(b.state.clearedSince).toBe(at)
    expect(h.sent.at(-1)!.kind).toBe('clear')
  })

  it('hide on one hides it on the other', () => {
    const { a, b } = pair()
    a.client.onLocalAction({ kind: 'hide', keys: deletionKeys(a.state.alerts[2]) })
    expect(view(b.state)).toHaveLength(2)
  })

  it('a copy ignores its own messages coming back from the relay', () => {
    const h = harness()
    const a = h.open('a', { ...empty(), alerts: [tv(1, 'x', 1)] })
    a.client.onLocalAction({ kind: 'clear', at: min(99).getTime() })
    // The relay echoed the clear to "a" too; the store already cleared itself,
    // the client must not apply it a second time.
    expect(view(a.state)).toEqual(['ARAI|tradingview|x'])
  })
})

describe('the store', () => {
  let emitted: LocalTimelineAction[] = []
  beforeEach(() => {
    emitted = []
    setTimelineActionListener((x) => emitted.push(x))
    useStore.setState({ alerts: [], hiddenAlertIds: new Set(), removedAlertKeys: new Set(), clearedSince: null,
      flaggedSymbols: new Set(['ARAI']), alertSubscriptions: [], hasMigratedSubs: true, config: { ...defaultConfig } } as any)
  })
  afterEach(() => setTimelineActionListener(null))

  it('announces a local delete, hide and clear', () => {
    useStore.setState({ alerts: [tv(1, 'a', 1), tv(2, 'b', 2)] } as any)
    const [x, y] = useStore.getState().alerts
    useStore.getState().removeAlert(x.id)
    useStore.getState().hideAlert(y.id)
    useStore.getState().clearAlerts()
    expect(emitted.map((e) => e.kind)).toEqual(['remove', 'hide', 'clear'])
    expect(emitted[0]).toEqual({ kind: 'remove', keys: ['dk:tv:1'] })
  })

  it('never re-announces what another copy did', () => {
    useStore.setState({ alerts: [tv(1, 'a', 1)] } as any)
    useStore.getState().applyRemoteTimeline({ v: 1, kind: 'remove', from: 'b', keys: ['dk:tv:1'] })
    useStore.getState().applyRemoteTimeline({ v: 1, kind: 'clear', from: 'b', at: T0 })
    expect(emitted).toEqual([])
  })

  it('a deleted TradingView alert stays off the timeline after a reload backfill', () => {
    // Before: removedAlertKeys was only read by the auditor, so the TV
    // backfill put a deleted TV alert straight back on reload.
    useStore.setState({ alerts: [tv(7, 'ARAI halted', 5)] } as any)
    useStore.getState().removeAlert(useStore.getState().alerts[0].id)
    // reload: alerts and hidden ids start empty, removedAlertKeys is persisted
    useStore.setState({ alerts: [], hiddenAlertIds: new Set() } as any)
    useStore.getState().addAlerts([tv(7, 'ARAI halted', 5), tv(8, 'ARAI halted', 50)])
    const s = useStore.getState()
    expect(s.alerts.filter((a) => !s.hiddenAlertIds.has(a.id)).map((a) => a.dedupKey)).toEqual(['tv:8'])
  })
})

describe('limits', () => {
  it('a full 500-row timeline fits well under the relay limit', () => {
    const alerts = Array.from({ length: 600 }, (_, i) => mk({
      symbol: 'ABCD', type: 'catalyst', message: 'X'.repeat(180), dedupKey: `cat:rid:${i}`, url: `/api/pr?id=${'9'.repeat(30)}`,
      source: 'useLoginBackfill:catalyst', timestamp: min(i),
    }))
    const keys = new Set(Array.from({ length: 3000 }, (_, i) => `ABCD|news|${'y'.repeat(40)}${i}`))
    const snap = buildSnapshot({ alerts, hiddenAlertIds: new Set(), removedAlertKeys: keys, clearedSince: null }, 'a', 'b')
    const size = JSON.stringify(snap).length
    expect(size).toBeLessThan(900_000)
    expect((snap as any).alerts).toHaveLength(500)
  })

  it('remembered deletes are capped, newest kept', () => {
    const many = Array.from({ length: REMOVED_KEYS_CAP + 10 }, (_, i) => `k${i}`)
    const s = addRemovedKeys(new Set(), many)
    expect(s.size).toBe(REMOVED_KEYS_CAP)
    expect(s.has('k0')).toBe(false)
    expect(s.has(`k${REMOVED_KEYS_CAP + 9}`)).toBe(true)
  })

  it('junk off the socket is ignored', () => {
    const c = createTimelineSyncClient({ instanceId: 'me', now: () => T0, send: () => { throw new Error('sent') }, getState: empty, apply: () => { throw new Error('applied') } })
    for (const junk of ['nope', '{}', '{"v":2,"kind":"clear","from":"x","at":1}', { v: 1, kind: 'remove', from: 'x' }, null]) {
      expect(() => c.onMessage(junk)).not.toThrow()
    }
  })
})
