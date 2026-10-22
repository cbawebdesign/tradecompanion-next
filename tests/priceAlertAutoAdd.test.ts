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

  it('still adds — and reports the list — for a REAL value', () => {
    const added = useStore.getState().setPriceAlertFromTimeline('NVDA', 'upperAlert', 123.45)
    expect(added).toBe('Alpha')
    const wl = useStore.getState().watchlists.find(w => w.id === 'wl-a')!
    expect(wl.symbols.map(s => s.symbol)).toContain('NVDA')
    expect(wl.symbols.find(s => s.symbol === 'NVDA')!.upperAlert).toBe(123.45)
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
