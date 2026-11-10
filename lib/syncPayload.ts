import type { useStore } from '@/store/useStore'
import { flaggedSubscribedTypes, defaultFlaggedAlertSubscriptions } from '@/lib/alertFilter'

type State = ReturnType<typeof useStore.getState>

/**
 * What one TC window sends to the server for its login, built from the store.
 *
 * Pulled out of useCosmosSync so it is a pure function: the live-sync code has
 * to build it in three places (before a save, after taking the server's copy,
 * after a conflict) and compare them, and two copies of this logic drifting
 * apart is exactly how a window would start echoing saves back and forth.
 */

/**
 * Config keys that do NOT ride the webConfig blob.
 */
export const WEBCONFIG_DENYLIST = new Set<string>([
  // Identity/infra, and fields synced separately (order as names; flagged
  // subscriptions as their own key).
  'userKey', 'hubUrl', 'watchlistOrder', 'flaggedAlertSubscriptions',
  // Device-local window layout (pane sizes differ per monitor).
  'alertBarHeight', 'alertBarHeightPercent', 'watchlistSplitPercent', 'flaggedListSplitPercent',
  // Secrets never ride the webConfig blob. These were being written to Cosmos
  // in plaintext and pulled down by every device that logged in.
  'grokApiKey', 'newsApiKey',
  // Already sent as their own top-level keys (below), which the worker and
  // older builds read. The blob carried a SECOND copy: filteredPrPositive is
  // 21 KB on justin2, so his doc was 69 KB — past the 64 KB a save can carry
  // while the window is closing (fetch keepalive). One copy each now.
  'excludeFilings', 'filteredPrPositive', 'filteredPrNegative', 'xShowAllTweets',
  // Per-MACHINE, not per-login: whether this computer runs the AHK companion.
  // With live sync, switching AHK off on a laptop that has no companion would
  // switch it off on the trading desktop a second later.
  'ahkEnabled', 'ahkUrl',
])

/** [upper, lower] — compact, because this rides every save. */
export type AlertPair = [number | null, number | null]

export interface SyncPayload {
  watchlists: Record<string, string[]>
  configs: Record<string, string>
}

/**
 * Build the payload, or null when local state is pristine.
 *
 * SAFETY: never let a pristine/empty local state overwrite good server data. A
 * forced re-login (sessionStorage session is cleared on browser restart) or a
 * failed restore can briefly leave the store at defaults while a userKey is
 * still set; pushing that would wipe the user's cloud doc. The user genuinely
 * clearing everything is a rare edge we accept not syncing.
 */
export function buildSyncPayload(state: State): SyncPayload | null {
  const isPristine =
    state.watchlists.every((w) => w.symbols.length === 0)
    && state.alertSubscriptions.length === 0
    && state.flaggedSymbols.size === 0
  if (isPristine) return null

  // Backend expects { "WatchlistName": ["SYM1", "SYM2"] }.
  const watchlistsForBackend: Record<string, string[]> = {}
  for (const wl of state.watchlists) {
    watchlistsForBackend[wl.name] = wl.symbols.map(s => s.symbol)
  }

  // Price alert levels. Justin (11/9): "It would be awesome if price alerts
  // followed the login." The backend's watchlists are bare symbol lists, so
  // until now an alert set on one computer never reached another — and a
  // login restore wiped them to empty. Only symbols with a level are sent.
  const watchlistAlerts: Record<string, Record<string, AlertPair>> = {}
  for (const wl of state.watchlists) {
    for (const s of wl.symbols) {
      if (s.upperAlert == null && s.lowerAlert == null) continue
      ;(watchlistAlerts[wl.name] ??= {})[s.symbol] = [s.upperAlert ?? null, s.lowerAlert ?? null]
    }
  }
  const standaloneAlerts: Record<string, AlertPair> = {}
  for (const [sym, a] of Object.entries(state.standaloneAlerts ?? {})) {
    if (a.upperAlert == null && a.lowerAlert == null) continue
    standaloneAlerts[sym] = [a.upperAlert ?? null, a.lowerAlert ?? null]
  }

  // Flattened "symbol → subscribed alert types" map for server-side Phase 2
  // filtering. Backend never sees client-side watchlist UUIDs, just the
  // derived pass-list keyed by uppercased symbol.
  const subscribedAlerts: Record<string, string[]> = {}
  for (const sub of state.alertSubscriptions) {
    const wl = state.watchlists.find(w => w.id === sub.watchlistId)
    if (!wl) continue
    for (const { symbol } of wl.symbols) {
      const key = symbol.toUpperCase()
      const set = subscribedAlerts[key] ?? (subscribedAlerts[key] = [])
      if (!set.includes(sub.alertType)) set.push(sub.alertType)
    }
  }

  // Flagged symbols: union the user's flagged-list subscription types onto
  // each flagged symbol's pass-list. Flagging a symbol should ensure its
  // alerts come through even when it isn't on a subscribed watchlist.
  const flaggedTypes = flaggedSubscribedTypes(state.config.flaggedAlertSubscriptions)
  if (flaggedTypes.length > 0) {
    Array.from(state.flaggedSymbols).forEach((sym) => {
      const key = sym.toUpperCase()
      const set = subscribedAlerts[key] ?? (subscribedAlerts[key] = [])
      for (const t of flaggedTypes) if (!set.includes(t)) set.push(t)
    })
  }

  // UUID-drift guard. If the user has watchlists with symbols AND
  // alertSubscriptions records, the flat map should NOT be empty. Empty means
  // every sub.watchlistId references a watchlist that no longer exists; refuse
  // to push the bad empty map and rebuild with default all-on instead.
  const hasSymbols = state.watchlists.some(w => w.symbols.length > 0)
  if (hasSymbols && Object.keys(subscribedAlerts).length === 0 && state.alertSubscriptions.length > 0) {
    const TYPES = ['Filings', 'PRs', 'TradeExchange', 'X']
    for (const wl of state.watchlists) {
      for (const { symbol } of wl.symbols) subscribedAlerts[symbol.toUpperCase()] = [...TYPES]
    }
  }

  // Watchlist dropdown order as NAMES (UUIDs are per device). Effective full
  // order: configured order first, then any lists not yet in it.
  const orderedIds = [
    ...(state.config.watchlistOrder || []).filter((id) => state.watchlists.some((w) => w.id === id)),
    ...state.watchlists.filter((w) => !(state.config.watchlistOrder || []).includes(w.id)).map((w) => w.id),
  ]
  const watchlistOrderNames = orderedIds
    .map((id) => state.watchlists.find((w) => w.id === id)?.name)
    .filter((n): n is string => typeof n === 'string')

  const webConfig: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(state.config)) {
    if (!WEBCONFIG_DENYLIST.has(k)) webConfig[k] = v
  }

  // Alert subscriptions keyed by watchlist NAME (not UUID), so they survive a
  // restore that mints new UUIDs.
  const subsByName: Record<string, { alertType: string; audioEnabled: boolean }[]> = {}
  for (const sub of state.alertSubscriptions) {
    const wl = state.watchlists.find((w) => w.id === sub.watchlistId)
    if (!wl) continue
    ;(subsByName[wl.name] ??= []).push({ alertType: sub.alertType, audioEnabled: sub.audioEnabled })
  }

  return {
    watchlists: watchlistsForBackend,
    configs: {
      tradingViewId: state.config.tradingViewId,
      audioEnabled: String(state.config.audioEnabled),
      ttsEnabled: String(state.config.ttsEnabled),
      theme: state.config.theme,
      excludeFilings: state.config.excludeFilings || '',
      filteredPrPositive: state.config.filteredPrPositive || '',
      filteredPrNegative: state.config.filteredPrNegative || '',
      showAllTradeExchange: String(state.config.showAllTradeExchange),
      xShowAllTweets: state.config.xShowAllTweets || '',
      hubUrl: state.config.hubUrl,
      marketCapMin: String(state.config.marketCapMin),
      marketCapMax: String(state.config.marketCapMax),
      flaggedSymbols: JSON.stringify(Array.from(state.flaggedSymbols)),
      alertSubscriptions: JSON.stringify(state.alertSubscriptions),
      alertSubscriptionsByName: JSON.stringify(subsByName),
      subscribedAlerts: JSON.stringify(subscribedAlerts),
      watchlistOrder: JSON.stringify(watchlistOrderNames),
      // Explicit defaults, never '{}'. Unset means "all flagged-list alert
      // types ON" (flaggedSubscribedTypes), but '{}' read back means "none" —
      // so serialising unset as '{}' turned a user's flagged alerts OFF on any
      // window that applied it. Caught by the two-windows-converge test.
      flaggedAlertSubscriptions: JSON.stringify(state.config.flaggedAlertSubscriptions ?? defaultFlaggedAlertSubscriptions()),
      watchlistAlerts: JSON.stringify(watchlistAlerts),
      standaloneAlerts: JSON.stringify(standaloneAlerts),
      webConfig: JSON.stringify(webConfig),
    },
  }
}

/**
 * Identity of a payload for "did anything change". Device-specific noise is
 * excluded on purpose: alertSubscriptions carries this window's UUIDs, so two
 * windows holding identical data would otherwise never agree, and every
 * update received from another window would look like a local edit and be
 * saved straight back — an echo between every open copy, forever.
 */
export function payloadHash(p: SyncPayload | null): string {
  if (!p) return ''
  const { alertSubscriptions: _uuids, ...rest } = p.configs
  return JSON.stringify({ watchlists: p.watchlists, configs: rest })
}
