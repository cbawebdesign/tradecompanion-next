// Optional per-user symbol blocklist.
//
// Justin maintains a curated set of tickers he would rather never see. The list
// is admin-managed server-side (GET /api/tcadmin/symbol-blocklist) so it is
// edited once instead of pasted into every user's Settings box, and each client
// polls it on a timer — same shape as the PR blacklist in excludePrPatterns.ts.
//
// Two things keep this safe by construction:
//
//   - It is OPT-IN. hideBlockedSymbols defaults false, so a user who has never
//     touched the setting is unaffected no matter what the list contains.
//   - It FAILS OPEN. An unreachable endpoint, an empty list or an unparseable
//     payload all mean "hide nothing". In a product whose worst bug is an alert
//     that never appears, a filter must never fail toward hiding more.

// Module-level cache, populated by useRemoteSymbolBlocklist. Null means "not
// fetched yet" and is treated the same as empty.
let remoteSymbols: Set<string> | null = null
let remoteLabel = ''

/** Split on any of pipe / comma / whitespace, upper-case, drop blanks. */
export function parseSymbolList(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(/[|,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  )
}

export function setRemoteSymbolBlocklist(raw: string | null | undefined, label?: string | null) {
  remoteSymbols = raw == null ? null : parseSymbolList(raw)
  if (typeof label === 'string') remoteLabel = label
}

/** How many tickers are currently loaded — shown in Settings so the user can see it arrived. */
export function remoteSymbolBlocklistCount(): number {
  return remoteSymbols?.size ?? 0
}

export function remoteSymbolBlocklistLabel(): string {
  return remoteLabel
}

/**
 * Is this symbol hidden for this user?
 *
 * `enabled` is the user's own opt-in. When it is false this returns false for
 * everything, which is why an empty or failed fetch can never cost an alert.
 */
export function isSymbolBlocked(
  symbol: string | null | undefined,
  enabled: boolean | undefined
): boolean {
  if (!enabled) return false
  if (!symbol) return false
  if (!remoteSymbols || remoteSymbols.size === 0) return false
  return remoteSymbols.has(symbol.toUpperCase())
}
