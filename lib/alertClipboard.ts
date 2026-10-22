import type { Alert } from '@/types'

/**
 * What clicking an alert title should put on the clipboard.
 *
 * Justin ("Loose Ends"): "There used to be something in TC where I click on a
 * title of an alert in the data ribbon or alerts timeline, the title would copy
 * to the clipboard. This doesn't seem to be working anymore since we introduced
 * the Pop Up."
 *
 * He is right, and only on the ribbon panes: the timeline handler still copies
 * (AlertBar.handleAlertMessageClick), but the per-symbol panes in Watchlist and
 * AlertsPage were changed to call openInViewer directly and never copied
 * anything. Shared from here so all three paths cannot drift again.
 *
 * SEC filings copy the URL instead, also his ask: "There is one alert that we
 * get (SEC Filings) where its not useful to copy the title to the clipboard.
 * Instead, can you copy the URL to the filings to the clip board?" A filing
 * title is boilerplate — "8-K - EVERNORTH HOLDINGS INC (0002092592) (Filer)" —
 * whereas the link is the thing worth pasting.
 */
export function clipboardTextForAlert(alert: Pick<Alert, 'type' | 'message' | 'url'>): string {
  if (alert.type === 'filing' && alert.url) return alert.url
  // "Catalyst PR " is a source prefix the UI adds, not part of the headline.
  return (alert.message || '').replace(/^Catalyst PR\s*/i, '')
}

/**
 * The popup's header title for an alert.
 *
 * Justin asked for this twice, and the two asks together fix the format:
 *   "Can you make the title SYMBOL - Alert Title instead of the generic
 *    'tradingview'?"  ("Pop Up Touchup")
 *   "Can you make the Title of the Pop Up the JSON Title from the Webhook?"
 *    ("Loose Ends")
 *
 * His popups read "SUB — tradingview": the symbol and the alert TYPE. He wants
 * the symbol kept and the type replaced with what he actually sent, so the
 * header becomes "SUB — Bullish Reversal (5 min)". parseTvPayload already
 * resolves a webhook body's `title` into Alert.message, so the message IS the
 * JSON title by the time it reaches here.
 *
 * The symbol is dropped when the title already opens with it — Justin's bots
 * post "AHTPI - Dilution Report", and "AHTPI — AHTPI - Dilution Report" reads
 * like a bug. Falls back to "SYMBOL — type" when there is no title at all, and
 * to the bare title when the alert carries no symbol, so the separator never
 * dangles at either end.
 */
export function popupTitleForAlert(alert: Pick<Alert, 'symbol' | 'type' | 'message'>): string {
  const symbol = (alert.symbol || '').trim()
  const msg = (alert.message || '').replace(/^Catalyst PR\s*/i, '').trim()

  if (!msg) return symbol ? `${symbol} — ${alert.type}` : String(alert.type)

  // Already leads with the ticker, in any of the shapes his bots use
  // ("AAPL - x", "AAPL: x", "AAPL — x", "$AAPL x"): don't say it twice.
  const leadsWithSymbol =
    !!symbol &&
    new RegExp(`^\\$?${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(msg)

  const full = !symbol || leadsWithSymbol ? msg : `${symbol} — ${msg}`

  // Long PR headlines would push the close button off a narrow popup. Truncate
  // the whole thing, so the symbol survives however long the title is.
  return full.length > 110 ? full.slice(0, 107) + '…' : full
}

/**
 * Whether a URL belongs to TradeCompanion, in which case the popup must not
 * offer "open in tab".
 *
 * Justin: "Disable 'open in tab' option on pop ups for any tradecompanion.com
 * subdomain… This is working if the url is research.tradecompanion.com but I
 * just created a second subdomain reports.tradecompanion.com and I would like
 * the 'Open in tab' option to be disabled for this sub domain."
 *
 * Matched on the host rather than wired per-button, so a third subdomain needs
 * no code change at all.
 */
export function isTradeCompanionHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'tradecompanion.com' || host.endsWith('.tradecompanion.com')
  } catch {
    return false
  }
}
