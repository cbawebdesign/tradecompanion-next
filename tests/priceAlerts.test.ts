import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '@/store/useStore'
import type { Watchlist } from '@/types'

/**
 * A price alert keyed in against a symbol must land on EVERY watchlist that
 * symbol appears on.
 *
 * Justin: "If a user sets price alerts on a symbol that is flagged, if the user
 * later unflags that symbol, the price alerts are lost even if the symbol is on
 * a watch list. Please carry over the keyed in price alerts to that symbol on
 * every watch list it appears on."
 *
 * The flagged list and the timeline both resolved a symbol to the FIRST
 * watchlist containing it and wrote only there — so the alert existed on one
 * list and looked lost from anywhere else.
 */

const wl = (id: string, name: string, symbols: string[]): Watchlist => ({
  id, name,
  symbols: symbols.map(symbol => ({ symbol, upperAlert: null, lowerAlert: null, notes: '' })),
})

const entry = (wlId: string, symbol: string) =>
  useStore.getState().watchlists.find(w => w.id === wlId)!.symbols.find(s => s.symbol === symbol)!

beforeEach(() => {
  useStore.setState({
    watchlists: [
      wl('a', 'Movers', ['AAPL', 'TSLA']),
      wl('b', 'Biotech', ['AAPL', 'SAVA']),
      wl('c', 'Untouched', ['NVDA']),
    ],
  })
})

describe('setPriceAlertEverywhere', () => {
  it('writes the alert to every watchlist holding the symbol', () => {
    useStore.getState().setPriceAlertEverywhere('AAPL', 'upperAlert', 250)
    expect(entry('a', 'AAPL').upperAlert).toBe(250)
    expect(entry('b', 'AAPL').upperAlert).toBe(250)
  })

  it('leaves other symbols on those same lists alone', () => {
    useStore.getState().setPriceAlertEverywhere('AAPL', 'upperAlert', 250)
    expect(entry('a', 'TSLA').upperAlert).toBeNull()
    expect(entry('b', 'SAVA').upperAlert).toBeNull()
  })

  it('does not touch a list that lacks the symbol', () => {
    const before = useStore.getState().watchlists.find(w => w.id === 'c')
    useStore.getState().setPriceAlertEverywhere('AAPL', 'upperAlert', 250)
    const after = useStore.getState().watchlists.find(w => w.id === 'c')
    // Identity preserved, so nothing downstream re-renders for an untouched list.
    expect(after).toBe(before)
  })

  it('handles upper and lower independently', () => {
    useStore.getState().setPriceAlertEverywhere('AAPL', 'upperAlert', 250)
    useStore.getState().setPriceAlertEverywhere('AAPL', 'lowerAlert', 180)
    expect(entry('a', 'AAPL')).toMatchObject({ upperAlert: 250, lowerAlert: 180 })
    expect(entry('b', 'AAPL')).toMatchObject({ upperAlert: 250, lowerAlert: 180 })
  })

  it('clearing sets null everywhere, not just where it was typed', () => {
    useStore.getState().setPriceAlertEverywhere('AAPL', 'upperAlert', 250)
    useStore.getState().setPriceAlertEverywhere('AAPL', 'upperAlert', null)
    expect(entry('a', 'AAPL').upperAlert).toBeNull()
    expect(entry('b', 'AAPL').upperAlert).toBeNull()
  })

  it('preserves notes and the other bound on the entry', () => {
    useStore.setState({ watchlists: [{
      id: 'a', name: 'Movers',
      symbols: [{ symbol: 'AAPL', upperAlert: 300, lowerAlert: null, notes: 'earnings 10/28' }],
    }] })
    useStore.getState().setPriceAlertEverywhere('AAPL', 'lowerAlert', 180)
    expect(entry('a', 'AAPL')).toMatchObject({
      upperAlert: 300, lowerAlert: 180, notes: 'earnings 10/28',
    })
  })

  it('is a no-op for a symbol on no list', () => {
    const before = useStore.getState().watchlists
    useStore.getState().setPriceAlertEverywhere('ZZZZ', 'upperAlert', 10)
    expect(useStore.getState().watchlists).toEqual(before)
  })

  it('survives unflagging — the alert lives on the watchlists, not the flag', () => {
    // The actual reported symptom: set it while flagged, unflag, still there.
    useStore.setState({ flaggedSymbols: new Set(['AAPL']) })
    useStore.getState().setPriceAlertEverywhere('AAPL', 'upperAlert', 250)
    useStore.getState().toggleFlag('AAPL')
    expect(useStore.getState().flaggedSymbols.has('AAPL')).toBe(false)
    expect(entry('a', 'AAPL').upperAlert).toBe(250)
    expect(entry('b', 'AAPL').upperAlert).toBe(250)
  })
})
