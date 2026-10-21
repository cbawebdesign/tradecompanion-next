/**
 * Unwraps a TradingView webhook body into display text, a link and a symbol.
 *
 * The worker stores the POST body verbatim as `raw_text` and broadcasts it
 * unchanged (TcIsoWorker Function1.cs, route "tv/{webhookKey}"), so every
 * client surface receives the raw body and has to make sense of it itself.
 * Two shapes arrive:
 *
 *   plain text   "SPCX Crossing 5.97"
 *   JSON         {"symbol":"AAPL","title":"Report","url":"https://..."}
 *
 * The JSON shape is documented in the worker and its symbol IS parsed there,
 * but the client only ever unwrapped `raw_text | text | message | alert`.
 * `title` was missing and `url` was never read at all, so Justin's bot posts
 * rendered as the literal JSON string with nothing clickable — while a payload
 * that happened to include "message" looked fine, which is why this read as
 * working when it shipped.
 *
 * Centralised because the timeline was not the only surface showing the raw
 * string: the per-symbol panes behind the data ribbon map the same field.
 * Fixing one and not the others just moves the complaint.
 */

export interface TvPayload {
  /** Human-readable text for the alert row. Never JSON. */
  text: string
  /** Link to open, if the payload carried one. */
  url?: string
  /** Symbol named explicitly in the body, upper-cased. */
  symbol?: string
}

/**
 * A ticker TradingView might legitimately send. Mirrors the first-word test
 * already used for plain text: ordinary tickers, crypto pairs, and futures
 * contracts like ES1!, which Justin tracks and which the old /^[A-Z]{1,5}$/
 * rejected.
 */
export function isTvSymbol(candidate: string): boolean {
  return (
    /^[A-Z]{1,5}$/.test(candidate) ||
    /^[A-Z]{2,10}(USD|USDT|USDC|PERP)$/.test(candidate) ||
    /^[A-Z]{1,4}\d*!$/.test(candidate)
  )
}

export function parseTvPayload(raw: unknown): TvPayload {
  const s = typeof raw === 'string' ? raw : ''
  const trimmed = s.trim()

  // Anything that is not a JSON object is plain text and is returned as-is.
  // This guard is why plain-text alerts have always worked and must keep
  // working — they never enter the branch below.
  if (!trimmed.startsWith('{')) return { text: s }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return { text: s } // malformed JSON: show it rather than swallow it
  }
  if (!parsed || typeof parsed !== 'object') return { text: s }

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = parsed[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
  }

  // raw_text/text/message/alert first to preserve the previous ordering, then
  // title/headline, which are the keys his bot actually sends.
  const text = pick('raw_text', 'text', 'message', 'alert', 'title', 'headline')
  const url = pick('url', 'link')

  const symRaw = pick('symbol', 'ticker').replace(/^\$/, '').toUpperCase()
  const symbol = isTvSymbol(symRaw) ? symRaw : undefined

  return {
    // Falling back to the original string matters: a JSON body with no
    // recognised text key should still show something rather than an empty row.
    text: text || s,
    ...(url ? { url } : {}),
    ...(symbol ? { symbol } : {}),
  }
}
