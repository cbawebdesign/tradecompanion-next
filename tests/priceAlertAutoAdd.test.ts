import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store/useStore'

/**
 * The silent watchlist-polluter.
 *
 * PriceAlertInput commits on EVERY blur, so focusing an Upper/Lower box on a
 * timeline or flagged-list row and clicking away — without typing — commits
 * null. That used to fall through and add the symbol to selectedWatchlistId,
 * while both callers suppressed their confirmation toast precisely because the
 * value was null. The boxes sit on every row of both lists, so a pass through
 * either could quietly add a dozen symbols to a list the user never picked.
 */
describe('setPriceAlertFromTimeline', () => {
  beforeEach(() => {
    useStore.setState({
      watchlists: [
        { id: 'wl-a', name: 'Alpha', symbols: [] },
        { id: 'wl-b', name: 'Beta', symbols: [{ symbol: 'TSLA', upperAlert: null, lowerAlert: null, notes: '' } as any] },
      ],
      selectedWatchlistId: 'wl-a',
      standaloneAlerts: {},
    })
  })

  it('does NOT add an untracked symbol when the committed value is null', () => {
    const added = useStore.getState().setPriceAlertFromTimeline('NVDA', 'upperAlert', null)
    expect(added).toBeNull()
    const all = useStore.getState().watchlists.flatMap(w => w.symbols.map(s => s.symbol))
    expect(all).not.toContain('NVDA')
  })

  it('an empty blur on many rows cannot grow a watchlist', () => {
    for (const s of ['AAPL', 'MSFT', 'AMZN', 'GOOG', 'META']) {
      useStore.getState().setPriceAlertFromTimeline(s, 'lowerAlert', null)
    }
    expect(useStore.getState().watchlists.find(w => w.id === 'wl-a')!.symbols).toHaveLength(0)
  })

  // Changed on Justin's "Loose Ends" ask: "the stock is on a flagged list but
  // not a watch list. TC will automatically put the stock on a random watch
  // list. Please fix." A real value is now held standalone — the alert still
  // fires, nobody's lists change.
  it('holds a REAL value standalone instead of adding to a watchlist', () => {
    const added = useStore.getState().setPriceAlertFromTimeline('NVDA', 'upperAlert', 123.45)
    expect(added).toBeNull()
    const all = useStore.getState().watchlists.flatMap(w => w.symbols.map(s => s.symbol))
    expect(all).not.toContain('NVDA')
    expect(useStore.getState().standaloneAlerts['NVDA']).toEqual({ upperAlert: 123.45, lowerAlert: null })
  })

  it('drops the standalone entry once both sides are cleared', () => {
    const st = useStore.getState()
    st.setPriceAlertFromTimeline('NVDA', 'upperAlert', 10)
    st.setPriceAlertFromTimeline('NVDA', 'lowerAlert', 5)
    expect(useStore.getState().standaloneAlerts['NVDA']).toBeTruthy()
    useStore.getState().setPriceAlertFromTimeline('NVDA', 'upperAlert', null)
    useStore.getState().setPriceAlertFromTimeline('NVDA', 'lowerAlert', null)
    expect(useStore.getState().standaloneAlerts['NVDA']).toBeUndefined()
  })

  it('clearing an alert on an ALREADY tracked symbol still works', () => {
    useStore.getState().setPriceAlertFromTimeline('TSLA', 'upperAlert', 500)
    const cleared = useStore.getState().setPriceAlertFromTimeline('TSLA', 'upperAlert', null)
    expect(cleared).toBeNull()
    const tsla = useStore.getState().watchlists.find(w => w.id === 'wl-b')!.symbols[0]
    expect(tsla.upperAlert).toBeNull()
    // and it must not have been duplicated onto the selected list
    expect(useStore.getState().watchlists.find(w => w.id === 'wl-a')!.symbols).toHaveLength(0)
  })
})
