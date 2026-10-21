import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from '../store/useStore'
import { runLoginBackfill, __resetBackfillGuards, buildBackfillAlerts } from '../lib/loginBackfill'
import { readFileSync } from 'fs'

/**
 * The last mile: backfill -> the REAL store -> the timeline.
 *
 * The other backfill tests stop at addAlerts with a stub, so they prove the
 * fetch and the alert shapes but not that the alerts survive the store's
 * admission gate. That gate is where I spent a day looking for a bug that was
 * never there, so it is worth pinning that these two types really do pass it.
 */
const RESPONSE = {
  ok: true,
  sinceUtc: '2026-10-20T20:00:00Z',
  scans: [
    { symbol: 'AHT', pct: 40.2, price: 2.58, session: 'AH', alertTimeEt: '2026-10-20T21:54:57', createdUtc: '2026-10-21T01:54:57Z' },
  ],
  catalysts: [
    { symbol: 'INO', title: 'INOVIO Announces Favorable Judgment', notes: 'Confirmed at $3.10', url: '', resourceId: 'a0cdf597', modifiedUtc: '2026-10-20T20:07:11Z' },
  ],
}

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body } as unknown as Response)))
}

describe('backfill lands on the real timeline', () => {
  beforeEach(() => {
    __resetBackfillGuards()
    useStore.setState({ alerts: [], clearedSince: null })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('alerts survive the store admission gate and appear', async () => {
    stubFetch(RESPONSE)
    const before = useStore.getState().alerts.length
    const outcome = await runLoginBackfill('/api', useStore.getState().addAlerts)
    const after = useStore.getState().alerts

    expect(outcome).toBe('applied')
    expect(after.length).toBe(before + 2)
    expect(after.map(a => a.symbol).sort()).toEqual(['AHT', 'INO'])
  })

  it('passes with no watchlists and no subscriptions at all', async () => {
    // scanner and catalyst are unfiltered types, so an empty config must not
    // gate them — this is the case a fresh login hits before CosmosSync lands.
    useStore.setState({ alerts: [], watchlists: [], alertSubscriptions: [], flaggedSymbols: new Set() })
    stubFetch(RESPONSE)
    await runLoginBackfill('/api', useStore.getState().addAlerts)
    expect(useStore.getState().alerts.length).toBe(2)
  })

  it('a second identical run does not double the timeline', async () => {
    stubFetch(RESPONSE)
    await runLoginBackfill('/api', useStore.getState().addAlerts)
    __resetBackfillGuards()            // simulate a fresh page load
    await runLoginBackfill('/api', useStore.getState().addAlerts)
    expect(useStore.getState().alerts.length).toBe(2)   // dedupKeys collapse
  })

  it('is correctly suppressed after the user clears the timeline', async () => {
    // Pre-close rows must not come back after "Clear All Alerts" — that is
    // intended behaviour, not the bug, and it should stay intended.
    useStore.setState({ alerts: [], clearedSince: Date.now() })
    stubFetch(RESPONSE)
    await runLoginBackfill('/api', useStore.getState().addAlerts)
    expect(useStore.getState().alerts.length).toBe(0)
  })
})

describe('a stale timeline must not suppress the backfill', () => {
  // This was the actual cause of "the backfill does nothing".
  //
  // alerts and hiddenAlertIds were both persisted and never pruned, so a
  // reload restored hundreds of old alerts with nearly all of them hidden.
  // The timeline looked empty, the backfill fetched correctly, and addAlerts
  // dropped every row as a duplicate of something already present but
  // invisible — reporting success the whole time.
  it('backfilled alerts are visible even when the same stories were hidden before', async () => {
    const prior = buildBackfillAlerts(RESPONSE)
    useStore.setState({
      alerts: prior,
      hiddenAlertIds: new Set(prior.map(a => a.id)),
      clearedSince: null,
    })
    // What a reload now does: the timeline is rebuilt, not restored.
    useStore.setState({ alerts: [], hiddenAlertIds: new Set() })

    __resetBackfillGuards()
    stubFetch(RESPONSE)
    await runLoginBackfill('/api', useStore.getState().addAlerts)

    const alerts = useStore.getState().alerts
    const hidden = useStore.getState().hiddenAlertIds
    const visible = alerts.filter(a => !hidden.has(a.id))
    expect(visible.length).toBe(2)
  })

  it('neither alerts nor hiddenAlertIds are written to storage', () => {
    // Guards the fix itself: re-persisting either one reintroduces the bug.
    const src = readFileSync(new URL('../store/useStore.ts', import.meta.url), 'utf8')
    const partialize = src.slice(src.indexOf('partialize:'), src.indexOf('onRehydrateStorage'))
    expect(partialize).not.toMatch(/^\s*alerts:\s*state\.alerts/m)
    expect(partialize).not.toContain('hiddenAlertIds:')
  })
})

describe('no per-symbol backfill on startup', () => {
  // The real cause of "trade exchange and SEC filings still come in on a
  // restart". useAlertAuditor.backfillNewSymbol() fired for every watchlist
  // symbol on every page load (its seen-set is module-level, so a reload made
  // them all "new"), fetching AlertsBySymbol back to ET midnight and pushing
  // filings / tweets / trade-exchange onto the timeline. The v2.8.37
  // suppression guarded only the periodic audit, never this path.
  //
  // Also exactly what Justin asked for: "when adding a new symbol to either a
  // flagged list or a watch list, please disable any backfill process for the
  // alerts timeline."
  it('the auditor no longer contains a per-symbol backfill path', () => {
    const src = readFileSync(new URL('../hooks/useAlertAuditor.ts', import.meta.url), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toContain('backfillNewSymbol(')
    expect(code).not.toContain('checkForNewSymbols(')
    expect(code).not.toMatch(/backfilledSymbols\s*=/)
  })

  it('the auditor still fetches AlertsBySymbol with a user filter only', () => {
    // The surviving periodic audit passes userKey; the removed path did not,
    // which is how it was identified in the worker logs.
    const src = readFileSync(new URL('../hooks/useAlertAuditor.ts', import.meta.url), 'utf8')
    const calls = src.split('\n').filter(l => l.includes('AlertsBySymbol?symbol='))
    expect(calls.length).toBe(1)
    expect(calls[0] + src.slice(src.indexOf(calls[0]), src.indexOf(calls[0]) + 400)).toContain('userKey')
  })
})
