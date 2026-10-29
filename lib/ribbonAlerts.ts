import type { Alert } from '@/types'
import { normalizeAlertMessage } from '@/lib/alertDedup'
import { shouldBlacklistAlert } from '@/lib/excludePrPatterns'

/**
 * The news list under the data ribbon for one symbol: live alerts from the
 * store merged with what /AlertsBySymbol returned, filtered and de-duplicated.
 *
 * Shared by the Alerts page and the Watchlist, which each carried their own
 * copy of this until "Data Ribbon Touchup" (10/27) changed four of its rules
 * at once.
 */

/**
 * Airtable bases whose rows stay in the ribbon for the server's 90-day window.
 * Everything else shows only since the previous close.
 *
 * Justin: "Make sure only items are showing up in the data ribbon that have hit
 * since the previous close except for the following Airtable Databases. For
 * these two airtables, I would like to display the last 90 days of data."
 */
export const NINETY_DAY_REPORT_BASES = new Set(['Press Release Summaries', 'IPO Reports'])

/** Two copies of one TradingView alert (live + stored) are this close in time. */
export const TV_SAME_ALERT_MS = 2000

/** Which Airtable base a report alert came from, live or fetched; null otherwise. */
export function reportBase(a: Pick<Alert, 'source'>): string | null {
  const s = a.source || ''
  if (s.startsWith('report:')) return s.slice('report:'.length)
  if (s.startsWith('useSignalR:newAirtableReport:')) return s.slice('useSignalR:newAirtableReport:'.length)
  return null
}

/**
 * Normalised text with a leading "SYM:" dropped.
 *
 * Justin (DAVI): "I think there is some code that is combining the Symbol with
 * the Headline and then TC thinks it's a different entry." Reports are written
 * as "DAVI: headline"; the Catalyst PR for the same story is "headline". Same
 * story, different text, so both showed.
 */
export function storyKey(a: Pick<Alert, 'message' | 'symbol'>): string {
  const m = normalizeAlertMessage(a.message)
  const sym = (a.symbol || '').toLowerCase()
  if (!sym) return m
  const prefix = sym + ':'
  return m.startsWith(prefix) ? m.slice(prefix.length).trim() : m
}

export function buildRibbonAlerts(
  live: Alert[],
  db: Alert[],
  opts: { excludePrPatterns?: string; sinceMs: number },
): Alert[] {
  const ts = (a: Alert) => new Date(a.timestamp).getTime()

  const merged = [...live, ...db]
    // Ambulance-chaser blacklist. DB rows come straight from /AlertsBySymbol and
    // never pass through the store's central addAlert filter, so blacklisted
    // catalyst/filing PRs would still show here (the "$CAPR data ribbon" leak).
    // Idempotent for live alerts, which were filtered upstream.
    .filter(a => !shouldBlacklistAlert(a.type, a.message, opts.excludePrPatterns))
    // Since the previous close, except the two 90-day bases (bounded server-side).
    .filter(a => ts(a) >= opts.sinceMs || NINETY_DAY_REPORT_BASES.has(reportBase(a) ?? ''))
    .sort((a, b) => ts(b) - ts(a))

  // A report that repeats another alert's story loses to it. Justin (DAVI): "I
  // like the Green colored one better than the red so ... take out the Red
  // duplicate entry" — green is the Catalyst PR, red the Press Release
  // Summaries row. Runs BEFORE the catalyst rule below, which would otherwise
  // hide the green one behind the red.
  const nonReportStories = new Set(merged.filter(a => a.type !== 'rss').map(storyKey))
  const withoutReportDupes = merged.filter(a => a.type !== 'rss' || !nonReportStories.has(storyKey(a)))

  // Justin (5/21): hide catalyst-confirmer alerts when the underlying PR / TX /
  // filing is here too — same headline, later, with a `($price)` suffix, so it
  // always won the dedup and hid the actual PR. If a catalyst is the ONLY
  // signal for this story it stays, or the pane would be empty despite a real
  // event.
  const nonCatalystStories = new Set(withoutReportDupes.filter(a => a.type !== 'catalyst').map(storyKey))

  const seenKeys = new Set<string>()
  const keptTv: Alert[] = []
  return withoutReportDupes
    .filter(a => a.type !== 'catalyst' || !nonCatalystStories.has(storyKey(a)))
    .filter(a => {
      // Justin ("Trading View Duplicate Detection"): "disable duplicate
      // detection on trading view alerts in the data ribbon so that every
      // trading view alert is displayed ... I will handle duplicates within the
      // tradingview script itself." So a repeat of the same text is a new row.
      // Only the live and stored copies of ONE alert collapse — they carry the
      // same server time.
      if (a.type === 'tradingview') {
        const same = keptTv.some(k => k.message === a.message && Math.abs(ts(k) - ts(a)) <= TV_SAME_ALERT_MS)
        if (same) return false
        keptTv.push(a)
        return true
      }
      // Per-symbol dedup: same story collapses to one row regardless of type
      // or timestamp.
      const key = `${a.symbol}|${storyKey(a)}`
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })
}
