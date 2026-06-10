import { useStore } from '@/store/useStore'

// Apply a server user-record to the local Zustand store. Shared by every
// restore path — login (LoginGate), "Load Key", and "Pull from Server"
// (SettingsPage) — so they all restore the SAME things. Restores watchlists
// (in saved dropdown order), flagged symbols, alert subscriptions (rebuilt by
// watchlist name against fresh UUIDs), flagged-list subscriptions, and the
// full settings blob (configs.webConfig), falling back to the individual
// legacy config keys for desktop-origin docs.
//
// History: login used to restore ONLY watchlists (with regenerated UUIDs),
// which orphaned subscriptions and dropped every other setting. A forced
// re-login (browser restart clears the sessionStorage session) then wiped
// Justin's effective state. Routing login through this function fixes that.
export function applyServerStateToStore(userData: any): string {
  const summary: string[] = []
  const cfg = (userData?.configs ?? {}) as Record<string, string | undefined>

  // Watchlists — convert dict { name: [symbols] } to Zustand array, restored
  // in the server's saved dropdown order (names; unknown names sort last).
  // We set watchlistOrder to the freshly-minted UUIDs inline, so order
  // round-trips reliably instead of depending on a separate name→UUID remap.
  if (userData?.watchlists && Object.keys(userData.watchlists).length > 0) {
    let orderNames: string[] = []
    try { const n = JSON.parse(cfg.watchlistOrder || '[]'); if (Array.isArray(n)) orderNames = n } catch {/* ignore */}
    const rank = (name: string) => {
      const i = orderNames.indexOf(name)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    const restored = Object.entries(userData.watchlists)
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([name, symbols]: [string, any]) => ({
        id: crypto.randomUUID(),
        name,
        symbols: (symbols as string[]).map((sym: string) => ({
          symbol: sym, upperAlert: null, lowerAlert: null, notes: '',
        })),
      }))
    useStore.getState().setWatchlists(restored)
    useStore.getState().reorderWatchlists(restored.map((w) => w.id))
    const total = restored.reduce((n, wl) => n + wl.symbols.length, 0)
    summary.push(`${restored.length} watchlist(s) / ${total} symbols`)
  }

  // Flagged symbols.
  try {
    const arr = JSON.parse(cfg.flaggedSymbols || '[]')
    if (Array.isArray(arr) && arr.length > 0) {
      useStore.setState({ flaggedSymbols: new Set(arr) })
      summary.push(`${arr.length} flag(s)`)
    }
  } catch {/* ignore */}

  // (Watchlist dropdown order is restored inline with the watchlists above.)

  // Alert subscriptions. Prefer the name-keyed map (alertSubscriptionsByName)
  // and rebuild against the freshly-minted watchlist UUIDs — the raw
  // alertSubscriptions array references the SENDING device's UUIDs, which no
  // longer exist here after the restore above regenerated them. Using the
  // stale UUIDs orphans every subscription, so the timeline filter drops all
  // gated alerts (Justin: "alerts were disabled across all watchlists").
  // Fall back to the legacy array for docs saved before this key existed.
  try {
    const byName = JSON.parse(cfg.alertSubscriptionsByName || '{}')
    if (byName && typeof byName === 'object' && Object.keys(byName).length > 0) {
      const wls = useStore.getState().watchlists
      const rebuilt = wls.flatMap((wl) =>
        (Array.isArray(byName[wl.name]) ? byName[wl.name] : []).map((s: any) => ({
          id: crypto.randomUUID(),
          alertType: s.alertType,
          watchlistId: wl.id,
          audioEnabled: s.audioEnabled ?? true,
        }))
      )
      if (rebuilt.length > 0) {
        useStore.setState({ alertSubscriptions: rebuilt })
        summary.push(`${rebuilt.length} subscription(s)`)
      }
    } else {
      const arr = JSON.parse(cfg.alertSubscriptions || '[]')
      if (Array.isArray(arr) && arr.length > 0) {
        useStore.setState({ alertSubscriptions: arr })
        summary.push(`${arr.length} subscription(s)`)
      }
    }
  } catch {/* ignore */}

  // Flagged-list alert subscriptions.
  try {
    const parsed = JSON.parse(cfg.flaggedAlertSubscriptions || '{}')
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      useStore.getState().updateConfig({ flaggedAlertSubscriptions: parsed } as any)
      summary.push('flagged subscriptions')
    }
  } catch {/* ignore */}

  // Full settings blob (preferred) — every Settings-tab field in one shot.
  // This is an explicit account load, so overwrite local wholesale. Falls
  // back to the individual legacy keys below for desktop-origin docs (or
  // older web docs) that predate the blob.
  let appliedBlob = false
  try {
    if (cfg.webConfig) {
      const blob = JSON.parse(cfg.webConfig)
      if (blob && typeof blob === 'object' && Object.keys(blob).length > 0) {
        useStore.getState().updateConfig(blob as any)
        appliedBlob = true
        summary.push(`${Object.keys(blob).length} setting(s)`)
      }
    }
  } catch {/* ignore */}

  if (!appliedBlob) {
    // Config scalars. Legacy desktop wrote PascalCase keys, web uses camelCase.
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = cfg[k]
        if (typeof v === 'string' && v.length > 0) return v
      }
      return undefined
    }
    const cfgPatch: Record<string, string> = {}
    const ef = pick('excludeFilings', 'ExcludeFilings'); if (ef) cfgPatch.excludeFilings = ef
    const fpp = pick('filteredPrPositive', 'FilterNewsPositive'); if (fpp) cfgPatch.filteredPrPositive = fpp
    const fpn = pick('filteredPrNegative', 'FilterNewsNegative'); if (fpn) cfgPatch.filteredPrNegative = fpn
    const tvid = pick('tradingViewId', 'TradingViewId'); if (tvid) cfgPatch.tradingViewId = tvid
    const xshow = pick('xShowAllTweets', 'XshowAllTweets'); if (xshow) cfgPatch.xShowAllTweets = xshow
    if (Object.keys(cfgPatch).length > 0) {
      useStore.getState().updateConfig(cfgPatch as any)
      summary.push(`${Object.keys(cfgPatch).length} setting(s)`)
    }
  }

  return summary.length > 0 ? `Restored ${summary.join(', ')}.` : 'Nothing on server to restore.'
}
