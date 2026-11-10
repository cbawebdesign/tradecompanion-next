import { useStore } from '@/store/useStore'
import { WEBCONFIG_DENYLIST, type AlertPair } from '@/lib/syncPayload'

// Apply a server user-record to the local Zustand store. Shared by every
// restore path — login (LoginGate), "Load Key", "Pull from Server"
// (SettingsPage) — and now by live sync, which calls it whenever another open
// copy of the same login saves.
//
// History: login used to restore ONLY watchlists (with regenerated UUIDs),
// which orphaned subscriptions and dropped every other setting. A forced
// re-login then wiped Justin's effective state. Routing login through this
// function fixed that.
//
// Live sync (11/9) changed three things, because this now runs every time
// another computer saves rather than once at login:
//
//   1. WATCHLISTS KEEP THEIR IDs, matched by name. It used to mint fresh UUIDs
//      on every call; done live, that reset whichever watchlist he had open
//      every few seconds. The selection is kept while that list still exists.
//
//   2. PRICE ALERT LEVELS COME ACROSS (configs.watchlistAlerts /
//      standaloneAlerts). The backend's watchlists are bare symbol lists, so
//      every restore used to set every level to empty. A doc from a build that
//      predates this has no such key, and then local levels are kept.
//
//   3. A KEY THAT IS PRESENT IS APPLIED EVEN WHEN EMPTY. Flags and
//      subscriptions were only applied when non-empty, so unflagging your last
//      symbol on one computer could never reach another. A key that is ABSENT
//      (a doc written by the legacy desktop app) still leaves local alone.
export function applyServerStateToStore(userData: any): string {
  const summary: string[] = []
  const cfg = (userData?.configs ?? {}) as Record<string, string | undefined>
  const has = (k: string) => typeof cfg[k] === 'string'
  const parse = <T,>(k: string, fallback: T): T => {
    try { const v = JSON.parse(cfg[k] as string); return (v ?? fallback) as T } catch { return fallback }
  }

  // Watchlists, in the server's saved dropdown order.
  if (userData?.watchlists && Object.keys(userData.watchlists).length > 0) {
    const orderNames: string[] = has('watchlistOrder') ? parse<string[]>('watchlistOrder', []) : []
    const rank = (name: string) => {
      const i = orderNames.indexOf(name)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    const serverHasAlerts = has('watchlistAlerts')
    const alerts = serverHasAlerts ? parse<Record<string, Record<string, AlertPair>>>('watchlistAlerts', {}) : {}

    const before = useStore.getState()
    const localByName = new Map(before.watchlists.map((w) => [w.name, w]))

    const restored = Object.entries(userData.watchlists as Record<string, string[]>)
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([name, symbols]) => {
        const local = localByName.get(name)
        return {
          id: local?.id ?? crypto.randomUUID(),
          name,
          symbols: (symbols ?? []).map((sym) => {
            const localItem = local?.symbols.find((s) => s.symbol === sym)
            const pair = alerts[name]?.[sym]
            return {
              symbol: sym,
              upperAlert: serverHasAlerts ? (pair?.[0] ?? null) : (localItem?.upperAlert ?? null),
              lowerAlert: serverHasAlerts ? (pair?.[1] ?? null) : (localItem?.lowerAlert ?? null),
              notes: localItem?.notes ?? '',
            }
          }),
        }
      })

    const keepSelected = before.selectedWatchlistId
    useStore.getState().setWatchlists(restored)
    useStore.getState().reorderWatchlists(restored.map((w) => w.id))
    // setWatchlists always selects the first list. Put his selection back if
    // that list survived — otherwise every save on another computer would
    // jump this one back to the top watchlist.
    if (keepSelected && restored.some((w) => w.id === keepSelected)) {
      useStore.setState({ selectedWatchlistId: keepSelected })
    }
    const total = restored.reduce((n, wl) => n + wl.symbols.length, 0)
    summary.push(`${restored.length} watchlist(s) / ${total} symbols`)
  }

  // Price alerts for symbols on no watchlist (flagged-only).
  if (has('standaloneAlerts')) {
    const raw = parse<Record<string, AlertPair>>('standaloneAlerts', {})
    const next: Record<string, { upperAlert: number | null; lowerAlert: number | null }> = {}
    for (const [sym, pair] of Object.entries(raw)) {
      if (pair?.[0] == null && pair?.[1] == null) continue
      next[sym] = { upperAlert: pair[0] ?? null, lowerAlert: pair[1] ?? null }
    }
    useStore.setState({ standaloneAlerts: next })
  }

  // Flagged symbols — applied even when empty, when the key is present.
  if (has('flaggedSymbols')) {
    const arr = parse<unknown[]>('flaggedSymbols', [])
    if (Array.isArray(arr)) {
      useStore.setState({ flaggedSymbols: new Set(arr as string[]) })
      summary.push(`${arr.length} flag(s)`)
    }
  }

  // Alert subscriptions, rebuilt by watchlist NAME against this window's ids.
  // The raw alertSubscriptions array holds the SENDING device's UUIDs, which
  // do not exist here. Falls back to that array only for docs that predate
  // the name-keyed map.
  if (has('alertSubscriptionsByName')) {
    const byName = parse<Record<string, { alertType: string; audioEnabled?: boolean }[]>>('alertSubscriptionsByName', {})
    const wls = useStore.getState().watchlists
    const rebuilt = wls.flatMap((wl) =>
      (Array.isArray(byName[wl.name]) ? byName[wl.name] : []).map((s) => ({
        id: crypto.randomUUID(),
        alertType: s.alertType,
        watchlistId: wl.id,
        audioEnabled: s.audioEnabled ?? true,
      }))
    )
    useStore.setState({ alertSubscriptions: rebuilt as any })
    summary.push(`${rebuilt.length} subscription(s)`)
  } else if (has('alertSubscriptions')) {
    const arr = parse<unknown[]>('alertSubscriptions', [])
    if (Array.isArray(arr) && arr.length > 0) {
      useStore.setState({ alertSubscriptions: arr as any })
      summary.push(`${arr.length} subscription(s)`)
    }
  }

  // Flagged-list alert subscriptions.
  // An EMPTY map is treated as unset, unlike flags. Every build before live
  // sync wrote "unset" (= all types on) as '{}', and '{}' applied literally
  // means all types OFF — it would silently stop a flagged symbol's alerts on
  // every other window. The UI never produces an empty map itself: switching
  // everything off yields { PRs: { enabled: false }, ... }.
  if (has('flaggedAlertSubscriptions')) {
    const parsed = parse<Record<string, unknown>>('flaggedAlertSubscriptions', {})
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      useStore.getState().updateConfig({ flaggedAlertSubscriptions: parsed } as any)
    }
  }

  // Full settings blob. Denylisted keys are stripped on the way IN as well as
  // out: a blob saved by an older build still carries ahkEnabled / ahkUrl and
  // the big filter texts, and must not overwrite this machine's own AHK
  // setting or fight the top-level copies applied below.
  let appliedBlob = false
  if (has('webConfig')) {
    const blob = parse<Record<string, unknown>>('webConfig', {})
    if (blob && typeof blob === 'object' && Object.keys(blob).length > 0) {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(blob)) if (!WEBCONFIG_DENYLIST.has(k)) clean[k] = v
      useStore.getState().updateConfig(clean as any)
      appliedBlob = true
      summary.push(`${Object.keys(clean).length} setting(s)`)
    }
  }

  // Settings carried as their own top-level keys (the worker reads
  // excludeFilings; older builds read all of them). Present → applied, even
  // when empty. Legacy desktop wrote PascalCase, so that is the fallback.
  const topLevel: Record<string, string[]> = {
    excludeFilings: ['excludeFilings', 'ExcludeFilings'],
    filteredPrPositive: ['filteredPrPositive', 'FilterNewsPositive'],
    filteredPrNegative: ['filteredPrNegative', 'FilterNewsNegative'],
    xShowAllTweets: ['xShowAllTweets', 'XshowAllTweets'],
  }
  // tradingViewId rides the blob; only docs without one need the fallback.
  if (!appliedBlob) topLevel.tradingViewId = ['tradingViewId', 'TradingViewId']
  const cfgPatch: Record<string, string> = {}
  for (const [field, keys] of Object.entries(topLevel)) {
    const k = keys.find(has)
    if (k) cfgPatch[field] = cfg[k] as string
  }
  if (Object.keys(cfgPatch).length > 0) {
    useStore.getState().updateConfig(cfgPatch as any)
    if (!appliedBlob) summary.push(`${Object.keys(cfgPatch).length} setting(s)`)
  }

  return summary.length > 0 ? `Restored ${summary.join(', ')}.` : 'Nothing on server to restore.'
}
