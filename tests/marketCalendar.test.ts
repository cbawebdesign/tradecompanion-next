import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prevMarketCloseISO } from '@/lib/marketCalendar'
import { previousMarketCloseISO } from '@/hooks/useAirtablePolling'

/**
 * CHARACTERIZATION TESTS — "since previous close"
 *
 * There are FOUR implementations of this idea in the codebase:
 *
 *   1. lib/marketCalendar.ts  prevMarketCloseISO()      — ET/DST-aware via Intl
 *   2. hooks/useAirtablePolling.ts previousMarketCloseISO() — hand-rolled offset
 *   3. Catalyst / Filings / TradeExchange polling — inline `M/D/YYYY H:M:S`
 *      built from BROWSER-LOCAL time (see the divergence test at the bottom)
 *   4. hooks/useAlertAuditor.ts — ET *midnight*, not previous close at all
 *
 * They disagree. That disagreement is the leading suspect for the days when
 * catalysts and PRs come back empty. These tests pin down what each one
 * actually returns so the four can be collapsed into one safely.
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

describe('previousMarketCloseISO — the Airtable copy', () => {
  it('also walks back over weekends', () => {
    at('2026-05-18T13:00:00Z') // Monday 9am ET
    expect(previousMarketCloseISO().slice(0, 10)).toBe('2026-05-15')
  })
})

describe('THE DIVERGENCE — why these must be unified', () => {
  it('AFTER 4PM ET they return DIFFERENT DAYS — this is the real bug', () => {
    // Both are DST-aware (the Airtable copy measures the real offset rather
    // than hard-coding -5, so the two agree on the hour). The divergence is
    // about WHICH DAY.
    //
    //   prevMarketCloseISO()      = YESTERDAY 4pm, always. Deliberate, so an
    //                               after-hours user still sees today's news.
    //   previousMarketCloseISO()  = MOST RECENT past 4pm. After the close that
    //                               is TODAY 4pm.
    //
    // So from 4pm ET onward the Airtable feeds cut off twelve hours later than
    // everything else, and RSS / YouTube / Substack items from earlier the same
    // day get filtered out. That is precisely Justin's 5/19 complaint, still
    // live in this second copy.
    at('2026-05-19T23:00:00Z') // Tue 7pm ET — after the close
    const good = prevMarketCloseISO()
    const copy = previousMarketCloseISO()

    expect(good.slice(0, 10)).toBe('2026-05-18') // Monday — correct
    expect(copy.slice(0, 10)).toBe('2026-05-19') // Tuesday — the old bug
    expect(good).not.toBe(copy)
  })

  it('BEFORE 4pm ET they agree, which is why this hides all morning', () => {
    at('2026-05-19T13:00:00Z') // Tue 9am ET
    expect(prevMarketCloseISO()).toBe(previousMarketCloseISO())
  })

  it('they agree on the DST hour — the offset is measured, not hard-coded', () => {
    at('2026-07-15T12:00:00Z') // mid-EDT, before the close
    expect(prevMarketCloseISO()).toBe(previousMarketCloseISO())
  })

  it('WRONG: the polling hooks send BROWSER-LOCAL time to an ET backend', () => {
    // Catalyst/Filings/TradeExchange build their `since` inline as
    //   `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:...`
    // getHours() is the *browser's* timezone. On an ET machine this is
    // invisible; anywhere else the request asks for the wrong window.
    // Replicated here because the expression is inline and cannot be imported.
    const d = new Date('2026-07-15T20:00:00Z')
    const inline = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
    expect(inline).toContain(`${d.getHours()}:`)
    expect(inline).not.toContain('Z')
  })
})
