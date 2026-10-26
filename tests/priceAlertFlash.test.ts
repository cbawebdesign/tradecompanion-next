import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from '@/store/useStore'
import { evaluatePriceAlerts, CLEAR_AFTER_MS } from '@/hooks/usePriceAlerts'
import { createDedupedStorage } from '@/lib/dedupedStorage'
import type { StateStorage } from 'zustand/middleware'

/**
 * Justin ("Price Alerts Bug"):
 *
 *  1. "the price alert box will flash when it triggers but it will just stay
 *     flashing for an indefinite period of time ... please clear out the price
 *     alert box after 5 seconds."
 *  2. "once there is a triggered price on the day, TC always thinks that same
 *     price is triggered no matter where the current price is."
 *
 * The boxes flash while `upper-SYM-price` is in triggeredPriceAlerts, so these
 * tests assert on that set and on the stored level — exactly what the three
 * components read to decide whether a box flashes.
 */

vi.mock('@/lib/alertAudio', () => ({ handleAlertAudio: () => {} }))

const SYM = 'SPCX'

function setUpper(value: number | null) {
  useStore.getState().setPriceAlertEverywhere(SYM, 'upperAlert', value)
}
function tick(last: number) {
  useStore.setState({ quotes: { [SYM]: { symbol: SYM, last } as any } })
  evaluatePriceAlerts(useStore.getState())
}
const upper = () => useStore.getState().watchlists[0].symbols[0].upperAlert
const flashing = (price: number) => useStore.getState().triggeredPriceAlerts.has(`upper-${SYM}-${price}`)
const priceAlerts = () => useStore.getState().alerts.filter(a => a.type === 'price')

beforeEach(() => {
  vi.useFakeTimers()
  useStore.setState({
    watchlists: [{ id: 'a', name: 'Movers', symbols: [{ symbol: SYM, upperAlert: null, lowerAlert: null, notes: '' }] }],
    standaloneAlerts: {},
    triggeredPriceAlerts: new Set(),
    alerts: [],
    quotes: {},
    clearedSince: null,
  } as any)
})
afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('price alert flash', () => {
  it('flashes on trigger, then clears the box and stops flashing after 5 seconds', () => {
    setUpper(150.2)
    tick(150.25)
    expect(flashing(150.2)).toBe(true)
    expect(priceAlerts()).toHaveLength(1)

    vi.advanceTimersByTime(CLEAR_AFTER_MS)
    expect(upper()).toBeNull()
    expect(flashing(150.2)).toBe(false)
  })

  it('stops flashing after 5 seconds even if another window puts the old level back', () => {
    setUpper(150.2)
    tick(150.25)
    vi.advanceTimersByTime(CLEAR_AFTER_MS)
    // A pop-out's stale copy re-applied by useCrossWindowSync.
    setUpper(150.2)
    expect(flashing(150.2)).toBe(false)
  })

  it('re-entering a level that fired earlier does not flash while price is away from it', () => {
    setUpper(150.2)
    tick(150.25)
    vi.advanceTimersByTime(CLEAR_AFTER_MS)

    setUpper(151)
    tick(149)
    setUpper(150.2)
    tick(149)
    expect(flashing(150.2)).toBe(false)
    expect(priceAlerts()).toHaveLength(1)
  })

  it('a re-entered level fires again when price actually reaches it', () => {
    setUpper(150.2)
    tick(150.25)
    vi.advanceTimersByTime(CLEAR_AFTER_MS)

    setUpper(150.2)
    tick(149)
    tick(150.3)
    expect(flashing(150.2)).toBe(true)
    expect(priceAlerts()).toHaveLength(2)
    vi.advanceTimersByTime(CLEAR_AFTER_MS)
    expect(upper()).toBeNull()
  })

  it('does not wipe a new level typed during the flash', () => {
    setUpper(150.2)
    tick(150.25)
    setUpper(151)
    vi.advanceTimersByTime(CLEAR_AFTER_MS)
    expect(upper()).toBe(151)
    expect(flashing(150.2)).toBe(false)
  })

  it('a second level that fires inside the first one\'s 5 seconds still clears', () => {
    setUpper(150.2)
    tick(150.25)
    vi.advanceTimersByTime(2000)
    setUpper(150.5)
    tick(150.6)
    expect(flashing(150.5)).toBe(true)
    vi.advanceTimersByTime(CLEAR_AFTER_MS)
    expect(upper()).toBeNull()
    expect(flashing(150.5)).toBe(false)
  })

  it('applies to flagged-only alerts as well', () => {
    useStore.setState({ watchlists: [] })
    useStore.getState().setPriceAlertFromTimeline(SYM, 'upperAlert', 150.2)
    tick(150.25)
    expect(flashing(150.2)).toBe(true)
    vi.advanceTimersByTime(CLEAR_AFTER_MS)
    expect(useStore.getState().standaloneAlerts[SYM]).toBeUndefined()
    expect(flashing(150.2)).toBe(false)
  })
})

describe('createDedupedStorage', () => {
  function backing() {
    const mem = new Map<string, string>()
    const writes: string[] = []
    const s: StateStorage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => { writes.push(v); mem.set(k, v) },
      removeItem: (k) => { mem.delete(k) },
    }
    return { s, mem, writes }
  }

  it('skips a write identical to the last one', () => {
    const b = backing()
    const st = createDedupedStorage(() => b.s)
    st.setItem('k', 'A')
    st.setItem('k', 'A')
    st.setItem('k', 'B')
    expect(b.writes).toEqual(['A', 'B'])
  })

  it('an unchanged stale window cannot overwrite a newer write from another window', () => {
    const b = backing()
    const main = createDedupedStorage(() => b.s)
    const popout = createDedupedStorage(() => b.s)
    popout.setItem('k', 'alert=150.20')
    main.setItem('k', 'alert=150.20')
    main.setItem('k', 'alert=null') // auto-clear
    popout.setItem('k', 'alert=150.20') // pop-out's next quote tick, nothing changed
    expect(b.mem.get('k')).toBe('alert=null')
  })

  it('does not rewrite what it just hydrated', () => {
    const b = backing()
    b.mem.set('k', 'A')
    const st = createDedupedStorage(() => b.s)
    st.getItem('k')
    st.setItem('k', 'A')
    expect(b.writes).toEqual([])
  })
})
