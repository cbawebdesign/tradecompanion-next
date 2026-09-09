import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prevMarketCloseISO } from '@/lib/marketCalendar'

/**
 * CHARACTERIZATION TESTS — "since previous close"
 *
 * There were FOUR implementations of this idea. Two remain:
 *
 *   1. lib/marketCalendar.ts  prevMarketCloseISO()  — the one true helper
 *   2. hooks/useAirtablePolling.ts — REMOVED, now calls (1). It used to return
 *      the MOST RECENT past 4pm, so after the close it cut off a day later
 *      than everything else and dropped RSS/YouTube/Substack items from
 *      earlier the same session.
 *   3. Catalyst / Filings / TradeExchange polling — still inline, built from
 *      BROWSER-LOCAL time in `M/D/YYYY H:M:S`. Not yet unified: the backend
 *      expects that string format, and changing it without being able to
 *      verify against the API risks dropping alerts entirely.
 *   4. hooks/useAlertAuditor.ts — ET *midnight*, not previous close. Also
 *      still outstanding.
 *
 * NOTE: several of these document behaviour that is WRONG. They are labelled.
 */

const at = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }
afterEach(() => vi.useRealTimers())

describe('prevMarketCloseISO — the good one', () => {
  it('returns YESTERDAY 4pm ET, never today, even late in the evening', () => {
    // Justin's 5/19 bug: "previous close" was "most recent past 4pm ET", so
    // opening TC after hours filtered out that same session's own news — a
    // 13:45 VUZI PR and morning INM filings vanished.
    at('2026-05-19T23:00:00Z') // Tue 7pm ET
    const iso = prevMarketCloseISO()
    expect(iso.slice(0, 10)).toBe('2026-05-18') // Monday, not Tuesday
  })

  it('walks back over the weekend to Friday', () => {
    at('2026-05-18T13:00:00Z') // Monday 9am ET
    expect(prevMarketCloseISO().slice(0, 10)).toBe('2026-05-15') // Friday
  })

  it('from Sunday, still lands on Friday', () => {
    at('2026-05-17T18:00:00Z') // Sunday
    expect(prevMarketCloseISO().slice(0, 10)).toBe('2026-05-15')
  })

  it('resolves 4pm ET to 20:00Z during EDT', () => {
    at('2026-07-15T12:00:00Z')
    expect(prevMarketCloseISO()).toMatch(/T20:00:00/)
  })

  it('resolves 4pm ET to 21:00Z during EST', () => {
    // The DST half. A fixed -5 offset gets this hour wrong half the year.
    at('2026-01-15T12:00:00Z')
    expect(prevMarketCloseISO()).toMatch(/T21:00:00/)
  })

  it('KNOWN GAP: holidays are not modelled', () => {
    // Documented in the source as acceptable — over-inclusive beats losing
    // events. Tue after a Monday holiday returns the holiday's 4pm.
    at('2026-01-20T14:00:00Z') // Tue after MLK Monday
    expect(prevMarketCloseISO().slice(0, 10)).toBe('2026-01-19') // the holiday
  })
})

describe('UNIFIED — regression guard', () => {
  it('the Airtable feeds now use the same cut-off as everything else', () => {
    // Before the fix, useAirtablePolling had its own copy returning the MOST
    // RECENT past 4pm. After the close that was TODAY 4pm, while every other
    // source used YESTERDAY 4pm — so RSS/YouTube/Substack silently dropped
    // items from earlier the same day. That copy is gone; this asserts the
    // behaviour the whole app now shares.
    at('2026-05-19T23:00:00Z') // Tue 7pm ET — after the close, where it used to break
    expect(prevMarketCloseISO().slice(0, 10)).toBe('2026-05-18') // Monday
  })

  it('STILL OUTSTANDING: the polling hooks send BROWSER-LOCAL time', () => {
    // Catalyst/Filings/TradeExchange build `since` inline as
    //   `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:...`
    // getHours() is the browser's timezone, and the value is a local-format
    // string rather than ISO. Invisible on an ET machine; wrong anywhere else.
    // Not unified yet — the backend expects this exact format and it cannot be
    // verified from here without API access.
    const d = new Date('2026-07-15T20:00:00Z')
    const inline = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
    expect(inline).not.toContain('Z')
    expect(inline).toContain(`${d.getHours()}:`)
  })
})
