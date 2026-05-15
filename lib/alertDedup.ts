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
    .replace(/^\s*\[[A-Za-z0-9_.-]+\]\s*/, '')
    .replace(/\s*\(\$\d+(?:\.\d+)?\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
