// Symbol extraction for report-style alert titles.
//
// Justin (9/23): "Please parse out the 1, 2, 3, 4 or 5 characters immediately
// preceding ':' and use those characters as the symbol so in these examples
// above MSS, MBRX, and ZEO would be listed as the symbol (allowing AHK to work
// when clicking on the time line to update charts)."
//
// His bots write reports into Airtable titled "MSS: China" or "ZEO: Retires
// $1.67M White Lion convertible debt". Before this, every row from a given
// Airtable view carried one hardcoded placeholder symbol — SUB, YT, NEWS — so
// the timeline showed "SUB" against a report about MSS. Clicking it could not
// load a chart, flagging it flagged nothing useful, and AHK had no ticker to
// fire on.
//
// Applies to the existing RSS/Substack/YouTube views and to every Airtable
// source added later, which is why it lives here rather than inside one hook.

/**
 * Pull a leading ticker off a "SYMBOL: rest of the title" string.
 *
 * Returns null when the prefix is not ticker-shaped, so the caller can fall
 * back to whatever it used before rather than putting a wrong symbol on an
 * alert. A wrong ticker is worse than a placeholder: it makes the alert look
 * like it is about a company it has nothing to do with.
 */
export function parseReportSymbol(title: string | null | undefined): string | null {
  if (!title) return null

  const colon = title.indexOf(':')
  if (colon < 1) return null

  // A URL scheme is ticker-shaped and would otherwise win: "https://..." has a
  // five-letter prefix and would tag the alert HTTPS. Same for http, ftp, mailto.
  if (title.slice(colon + 1, colon + 3) === '//') return null

  const raw = title.slice(0, colon).trim()

  // Must already be upper-case in the source. His bots write tickers in caps
  // (CTSO, BSP); humans write mixed case, and a newsletter called "Za" would
  // otherwise be tagged as ZA — a real ticker, on a weekly market report that
  // has nothing to do with that company. Seen live on 10/18.
  //
  // A wrong ticker is worse than a placeholder: it makes an alert look like
  // news about a company it is unrelated to, and sends AHK to the wrong chart.
  // Losing a lowercase ticker costs a placeholder; this costs a misattribution.
  if (/[a-z]/.test(raw)) return null

  const candidate = raw.toUpperCase()

  // 1-5 characters, letters and digits only. Deliberately strict:
  //   "MSS: China"                         -> MSS
  //   "ZEO: Retires $1.67M convertible"    -> ZEO
  //   "Breaking: Fed holds rates"          -> null  (7 chars, not a ticker)
  //   "https://x.com/..."                  -> null  (the colon is in the scheme)
  //
  // Digits are allowed because some tickers carry them, but a purely numeric
  // prefix is a time or a list marker, not a symbol.
  if (!/^[A-Z0-9]{1,5}$/.test(candidate)) return null
  if (!/[A-Z]/.test(candidate)) return null

  return candidate
}

/**
 * The symbol an Airtable-sourced alert should carry: the parsed ticker when the
 * title provides one, otherwise the view's placeholder (SUB / YT / NEWS).
 */
export function resolveReportSymbol(
  title: string | null | undefined,
  fallback: string
): string {
  return parseReportSymbol(title) ?? fallback
}
// Placeholder symbols the Airtable views stamp on rows whose title carries no
// ticker — a Substack essay or a YouTube video is about a theme, not a company.
export const PLACEHOLDER_SYMBOLS = new Set(['SUB', 'YT', 'NEWS'])

/**
 * Does this alert's symbol refer to an actual company?
 *
 * Used to decide whether to offer the price-alert boxes on a timeline row.
 * Justin asked for them on "EVERY time line message that has a symbol tagged
 * (so ignore Substack and YouTube)" — the placeholders above are exactly those.
 *
 * Note this reads the resolved symbol, so a Substack row titled "MSS: China"
 * has already become MSS by the time it gets here and correctly qualifies.
 */
export function isTradeableSymbol(symbol: string | null | undefined): boolean {
  if (!symbol) return false
  const s = symbol.trim().toUpperCase()
  if (!s || PLACEHOLDER_SYMBOLS.has(s)) return false
  return /^[A-Z0-9.!-]{1,10}$/.test(s)
}
