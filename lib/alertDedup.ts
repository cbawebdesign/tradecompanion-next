/**
 * Normalize an alert message so dupes coming from different sources
 * (SignalR live + REST poll + DB backfill) collapse into a single entry.
 *
 * Specifically:
 *   - Strip `[TX-NewsX]` prefix variants used by Trade Exchange. The SignalR
 *     frame and the DB row carry the same content but the prefix only
 *     appears on one of them, so without stripping they were both passing
 *     dedup.
 *   - Strip a trailing ` ($12.34)` price suffix added by the catalyst
 *     confirmer — the DB row stores just the title, the live alert tacks
 *     the trigger price on the end.
 *   - Collapse whitespace + lowercase so cosmetic differences don't matter.
 */
export function normalizeAlertMessage(msg: string | undefined | null): string {
  if (!msg) return ''
  return msg
    .replace(/^\s*\[TX-News\d*\]\s*/i, '')
    .replace(/\s*\(\$\d+(?:\.\d+)?\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
