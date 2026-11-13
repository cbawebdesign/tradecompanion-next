import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useStore, defaultConfig } from '../store/useStore'
import { evaluatePriceAlerts, CLEAR_AFTER_MS } from '../hooks/usePriceAlerts'
import { foldStandaloneIntoWatchlists, staleTriggeredKeys } from '../lib/priceAlertHome'
import { buildSyncPayload, payloadHash } from '../lib/syncPayload'
import { applyServerStateToStore } from '../lib/applyServerState'

const print = (sym: string, last: number) => {
  useStore.setState((s: any) => ({ quotes: { ...s.quotes, [sym]: { symbol: sym, last, change: 0, changePercent: 0, seeded: false, snapshot: false } } }))
  evaluatePriceAlerts(useStore.getState())
}
const fired = (sym: string) => useStore.getState().alerts.filter((a: any) => a.type === 'price' && a.symbol === sym).length
const entry = (sym: string) => useStore.getState().watchlists.flatMap((w) => w.symbols).find((s) => s.symbol === sym)

/** Justin's ARAI at 9:36 on 11/13: standalone 2.61 / 2.25, AND on a watchlist. */
const arai = () => useStore.setState({
  watchlists: [{ id: 'w', name: 'Main', symbols: [{ symbol: 'ARAI', upperAlert: null, lowerAlert: null, notes: '' }] }],
  standaloneAlerts: { ARAI: { upperAlert: 2.61, lowerAlert: 2.25 } },
  alerts: [], triggeredPriceAlerts: new Set(), quotes: {}, hasMigratedSubs: true, flaggedSymbols: new Set(),
  alertSubscriptions: [], config: { ...defaultConfig },
} as any)

beforeEach(() => vi.useFakeTimers())
// Let any 5s clear still pending finish: the pending-clear set is module-level
// and would otherwise make the next test skip its clear as a duplicate.
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers() })

describe('ARAI, 11/13', () => {
  it('fires ONCE while the price stays under the level, then clears', () => {
    arai()
    // His screenshot: $1.91, 1.89, 1.84, 1.80 … 6 seconds apart, a new alert each time.
    for (const p of [1.91, 1.89, 1.84, 1.80, 1.87, 1.90, 1.88, 1.83]) { print('ARAI', p); vi.advanceTimersByTime(6000) }
    expect(fired('ARAI')).toBe(1)
    expect(entry('ARAI')!.lowerAlert).toBeNull()
    // The level that did NOT fire is kept.
    expect(entry('ARAI')!.upperAlert).toBe(2.61)
    expect(useStore.getState().standaloneAlerts.ARAI).toBeUndefined()
  })

  it('clearing the box during the flash stops it at once — "make sure the symbol resets"', () => {
    arai()
    print('ARAI', 1.91)
    expect(useStore.getState().triggeredPriceAlerts.has('lower-ARAI-2.25')).toBe(true)
    useStore.getState().setPriceAlertFromTimeline('ARAI', 'lowerAlert', null)   // he clears it on the timeline row
    expect(useStore.getState().triggeredPriceAlerts.has('lower-ARAI-2.25')).toBe(false)
    expect(entry('ARAI')!.lowerAlert).toBeNull()
    print('ARAI', 1.80); vi.advanceTimersByTime(CLEAR_AFTER_MS + 100)
    expect(fired('ARAI')).toBe(1)
  })

  it('re-entering the same level re-arms it cleanly', () => {
    arai()
    print('ARAI', 1.91); vi.advanceTimersByTime(CLEAR_AFTER_MS + 100)
    useStore.getState().setPriceAlertFromTimeline('ARAI', 'lowerAlert', 2.25)
    print('ARAI', 1.85)
    expect(fired('ARAI')).toBe(2)
  })
})

describe('the plain cases still work', () => {
  it('standalone-only (flagged, on no watchlist) fires once and clears', () => {
    useStore.setState({ watchlists: [], standaloneAlerts: { ARAI: { upperAlert: 2.61, lowerAlert: 2.25 } },
      alerts: [], triggeredPriceAlerts: new Set(), quotes: {}, config: { ...defaultConfig } } as any)
    for (const p of [1.9, 1.8, 1.7]) { print('ARAI', p); vi.advanceTimersByTime(6000) }
    expect(fired('ARAI')).toBe(1)
    expect(useStore.getState().standaloneAlerts.ARAI).toEqual({ upperAlert: 2.61, lowerAlert: null })
  })

  it('watchlist-only fires once and clears', () => {
    useStore.setState({ watchlists: [{ id: 'w', name: 'Main', symbols: [{ symbol: 'TSLA', upperAlert: 300, lowerAlert: null, notes: '' }] }],
      standaloneAlerts: {}, alerts: [], triggeredPriceAlerts: new Set(), quotes: {}, config: { ...defaultConfig } } as any)
    for (const p of [301, 305, 302]) { print('TSLA', p); vi.advanceTimersByTime(6000) }
    expect(fired('TSLA')).toBe(1)
    expect(entry('TSLA')!.upperAlert).toBeNull()
  })
})

describe('one home per alert', () => {
  it('adding a symbol with a timeline alert to a watchlist moves the alert onto it', () => {
    useStore.setState({ watchlists: [{ id: 'w', name: 'Main', symbols: [] }], standaloneAlerts: { HUBC: { upperAlert: null, lowerAlert: 0.42 } },
      triggeredPriceAlerts: new Set() } as any)
    useStore.getState().addSymbolToWatchlist('w', { symbol: 'HUBC', upperAlert: null, lowerAlert: null, notes: '' })
    expect(entry('HUBC')!.lowerAlert).toBe(0.42)
    expect(useStore.getState().standaloneAlerts.HUBC).toBeUndefined()
  })

  it('a level already on the watchlist wins over the timeline copy', () => {
    const f = foldStandaloneIntoWatchlists(
      [{ id: 'w', name: 'Main', symbols: [{ symbol: 'AIMD', upperAlert: 5, lowerAlert: null, notes: '' }] }] as any,
      { AIMD: { upperAlert: 9, lowerAlert: 3 } })!
    expect(f.watchlists[0].symbols[0]).toMatchObject({ upperAlert: 5, lowerAlert: 3 })
    expect(f.standaloneAlerts).toEqual({})
  })

  it('nothing to fold → no change (so the store subscriber settles)', () => {
    expect(foldStandaloneIntoWatchlists([{ id: 'w', name: 'M', symbols: [{ symbol: 'A', upperAlert: 1, lowerAlert: null, notes: '' }] }] as any, { B: { upperAlert: 2, lowerAlert: null } })).toBeNull()
  })

  it('a stale flash key is one whose level no longer exists', () => {
    expect(staleTriggeredKeys(new Set(['lower-ARAI-2.25', 'upper-TSLA-300']),
      [{ id: 'w', name: 'M', symbols: [{ symbol: 'TSLA', upperAlert: 300, lowerAlert: null, notes: '' }] }] as any, {}))
      .toEqual(['lower-ARAI-2.25'])
  })

  it('live sync still converges: two windows fold identically', () => {
    arai()
    const a = buildSyncPayload(useStore.getState())!
    useStore.setState({ watchlists: [{ id: 'default', name: 'Main', symbols: [] }], standaloneAlerts: {}, flaggedSymbols: new Set(), alertSubscriptions: [] } as any)
    applyServerStateToStore({ ...a, revision: 1 })
    expect(payloadHash(buildSyncPayload(useStore.getState()))).toBe(payloadHash(a))
  })
})
