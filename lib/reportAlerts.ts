import type { Alert } from '@/types'
import { alertTypeColorHex } from '@/lib/alertTypeColor'

/**
 * Airtable report rows from /AlertsBySymbol, as data-ribbon alerts.
 *
 * Justin (10/25, on DAVI): "I just tested the symbol DAVI though that has a
 * IPO Report last modified on 10/23 and it's not showing in the data ribbon.
 * Just want to make sure that every one of these Airtable databases will show
 * in the data ribbon unless they have a button."
 *
 * The server had been returning them the whole time — AlertsBySymbol?symbol=
 * DAVI answers with the IPO Report — but the three client call sites that map
 * that response mapped tweets, filings, tradeExchange, tradingView and
 * catalysts, and never touched `reports`. So NO Airtable base has ever
 * appeared in the ribbon's news pane, which made the server-side work on the
 * 90-day window and the button exclusion impossible to see.
 *
 * Shared from here because that response is mapped in three places (the
 * Watchlist prefetch, the Watchlist fetch and the AlertsPage fetch) and a
 * sixth collection added to only two of them is the same bug again.
 *
 * Typed 'rss' to match the LIVE push in useSignalR's newAirtableReport
 * handler: reports he always wants, not watchlist-gated news. Matching it
 * also means a report that arrived live and the same report fetched back from
 * the ribbon render identically.
 */
export interface ReportRow {
  time?: string
  text?: string
  source?: string
  symbol?: string
  url?: string
  notes?: string
}

export function mapReportAlerts(rows: ReportRow[] | undefined, symbol: string): Alert[] {
  if (!rows?.length) return []
  const out: Alert[] = []
  for (const r of rows) {
    const when = new Date(r.time ?? '')
    if (isNaN(when.getTime())) continue
    const title = (r.text || '').trim()
    out.push({
      // Stable across refetches so React keys do not churn, and distinct per
      // base — two bases can legitimately hold the same symbol and title.
      id: `db-report-${r.source || ''}-${r.time || ''}-${symbol}`,
      symbol,
      // Which base it came from — the ribbon keeps some bases for 90 days and
      // everything else since the previous close (lib/ribbonAlerts).
      source: `report:${r.source || ''}`,
      // "SYMBOL: Title" is the shape his bots write and the shape the live
      // handler already uses, so the ticker stays clickable for AHK.
      message: title ? `${symbol}: ${title}` : `${symbol}: ${r.source || 'Report'}`,
      type: 'rss',
      color: alertTypeColorHex('rss'),
      timestamp: when,
      read: false,
      ...(r.url ? { url: r.url } : {}),
    })
  }
  return out
}
