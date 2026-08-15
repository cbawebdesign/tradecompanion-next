/**
 * Normalize an alert message so dupes coming from different sources
 * (SignalR live + REST poll + DB backfill) collapse into a single entry.
 *
 * Specifically:
 *   - Strip any leading `[Source]` prefix (no-spaces source identifier).
 *     Trade Exchange uses `[TX-News1]`, `[Benzinga]`, etc. and the SignalR
 *     frame sometimes drops the prefix entirely when `source` is empty,
 *     so the same post arrived once with a bracket and once without and
 *     dedup missed it. Match any bracketed token of letters/digits/dashes.
 *   - Strip a trailing ` ($12.34)` price suffix added by the catalyst
 *     confirmer — the DB row stores just the title, the live alert tacks
 *     the trigger price on the end.
 *   - Collapse whitespace + lowercase so cosmetic differences don't matter.
 */
export function normalizeAlertMessage(msg: string | undefined | null): string {
  if (!msg) return ''
  return msg
    // Strip a leading [Source] / [+] / [-] / [+-] prefix. The `+` matters: the
    // FilteredPR alert tags the same headline as "[+] ..." / "[-] ...", so
    // without it the filtered copy never collapsed against the plain PR and
    // showed twice in the data ribbon (Justin's [+] duplicate).
    .replace(/^\s*\[[A-Za-z0-9_.+-]+\]\s*/, '')
    .replace(/\s*\(\$\d+(?:\.\d+)?\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Common SEC form codes. Filings are stored as "8-K: {title}" on the live/poll
// path but arrive as just "{title}" from the per-symbol REST feed — strip the
// form code so both key the same. Conservative (real form codes only) so it
// never chops a normal title. Runs after normalizeAlertMessage (already lowercase).
const FILING_FORM_PREFIX =
  /^(?:8-k|10-[kq]|s-[1348]|f-[1346]|6-k|20-f|40-f|11-k|def ?14[ac]|defa?14[ac]|prer?14[ac]|sc 13[dg]|sc to-[a-z]|424b\d+|fwp|13f\S*|n-\S+|[3-6])(?:\/a)?:\s*/

/**
 * Stable cross-source key for matching "the same alert" — symbol|type|first-40
 * of the NORMALIZED message. Used by both the store's removeAlert (to remember
 * user deletions) and the alert-auditor (so it won't re-inject them). Normalizing
 * on BOTH sides is essential: the live/stored message carries a [Source] / form
 * prefix the auditor's REST-feed text does not, so a raw-substring key never matched.
 */
export function alertMatchKey(symbol: string, type: string, message: string | undefined | null): string {
  let m = normalizeAlertMessage(message)
  if (type === 'filing') m = m.replace(FILING_FORM_PREFIX, '')
  return `${symbol}|${type}|${m.substring(0, 40)}`
}
