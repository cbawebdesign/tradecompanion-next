/**
 * The order watchlists are shown in, everywhere.
 *
 * config.watchlistOrder holds ids in the order the user arranged them in
 * Settings. The right-click "Add to" menu, the chips and the dropdown all
 * apply it, for the reason SymbolContextMenu gives: "users pick by position
 * and end up adding to the wrong list."
 *
 * Extracted here because the popup bridge now reports watchlist names to
 * embedded pages, and Justin's bot asked for them "in the same order as the
 * app's own Add To menu" — which only stays true if there is one copy of this.
 *
 * Ids missing from the saved order (a list made since it was last saved) keep
 * their existing relative position at the end, rather than vanishing.
 */
export function orderWatchlists<T extends { id: string }>(
  raw: T[],
  order: string[] | undefined,
): T[] {
  if (!order || order.length === 0) return raw
  const byId = new Map(raw.map((w) => [w.id, w]))
  const out: T[] = []
  for (const id of order) {
    const w = byId.get(id)
    if (w) { out.push(w); byId.delete(id) }
  }
  byId.forEach((w) => out.push(w))
  return out
}
