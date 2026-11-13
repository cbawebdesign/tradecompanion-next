import type { Watchlist } from '@/types'

type Standalone = Record<string, { upperAlert: number | null; lowerAlert: number | null }>

/**
 * A symbol's price alert lives in exactly ONE place.
 *
 * Justin (11/13, ARAI): "When a lower price alert triggers, the alert keeps
 * flashing perpetually and since the alert doesn't clear out, it just keeps
 * triggering over and over as long as the price stays below that level ...
 * once I do clear out the price level, make sure the symbol resets."
 *
 * ARAI's 2.25 was a STANDALONE alert (set from the timeline while ARAI was on
 * no watchlist — 2.8.49) and ARAI was also on a watchlist. Every path that
 * clears a level asked "is this symbol on a watchlist?", found yes, and
 * cleared the WATCHLIST copy — already empty. The standalone 2.25 survived,
 * the flash key was dropped on schedule, and the next print fired it again,
 * every ~6 seconds for as long as the price stayed under. Clearing the box
 * went down the same wrong path, which is why it "kept lingering".
 *
 * How a symbol ends up in both: an alert set from the timeline while it was on
 * no list, then the symbol added to a list later — on this computer, or, since
 * live sync, on another one. His doc had two more in that state (AIMD, HUBC).
 *
 * The rule: a symbol on any watchlist keeps its alerts on its watchlist
 * entries. A standalone level is folded in (only where the entry has none, so
 * a level visible on the watchlist always wins) and the standalone copy is
 * removed. Deterministic, so every open window folds identically and live sync
 * converges instead of bouncing.
 */
export function foldStandaloneIntoWatchlists(
  watchlists: Watchlist[],
  standalone: Standalone | undefined,
): { watchlists: Watchlist[]; standaloneAlerts: Standalone } | null {
  if (!standalone) return null
  const onList = new Set<string>()
  for (const w of watchlists) for (const s of w.symbols) onList.add(s.symbol)
  const overlap = Object.keys(standalone).filter((sym) => onList.has(sym))
  if (overlap.length === 0) return null

  const nextStandalone = { ...standalone }
  for (const sym of overlap) delete nextStandalone[sym]

  const nextWatchlists = watchlists.map((w) =>
    w.symbols.some((s) => standalone[s.symbol])
      ? {
          ...w,
          symbols: w.symbols.map((s) => {
            const sa = standalone[s.symbol]
            if (!sa) return s
            return {
              ...s,
              upperAlert: s.upperAlert ?? sa.upperAlert ?? null,
              lowerAlert: s.lowerAlert ?? sa.lowerAlert ?? null,
            }
          }),
        }
      : w,
  )
  return { watchlists: nextWatchlists, standaloneAlerts: nextStandalone }
}

/** The flash/trigger keys usePriceAlerts writes: `${side}-${symbol}-${level}`. */
function armedKeys(watchlists: Watchlist[], standalone: Standalone | undefined): Set<string> {
  const keys = new Set<string>()
  const add = (sym: string, u: number | null | undefined, l: number | null | undefined) => {
    if (u != null && u > 0) keys.add(`upper-${sym}-${u}`)
    if (l != null && l > 0) keys.add(`lower-${sym}-${l}`)
  }
  for (const w of watchlists) for (const s of w.symbols) add(s.symbol, s.upperAlert, s.lowerAlert)
  for (const [sym, a] of Object.entries(standalone ?? {})) add(sym, a.upperAlert, a.lowerAlert)
  return keys
}

/**
 * Trigger keys whose level is no longer set anywhere — cleared or changed by
 * hand, or by another window. Dropping them ends the flash at once ("make sure
 * the symbol resets") and lets the same level, if re-entered, arm fresh.
 */
export function staleTriggeredKeys(
  triggered: Set<string>,
  watchlists: Watchlist[],
  standalone: Standalone | undefined,
): string[] {
  if (triggered.size === 0) return []
  const armed = armedKeys(watchlists, standalone)
  return Array.from(triggered).filter((k) => !armed.has(k))
}
