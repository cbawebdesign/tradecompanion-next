// Default ambulance-chaser / class-action PR blacklist.
// Pipe-delimited regex alternation, case-insensitive.
// Mirrors Util.DEFAULT_EXCLUDE_PR_PATTERNS in the legacy desktop app.
//
// Precedence at runtime:
//   1. Remote value from /api/tcadmin/pr-blacklist (set by the admin dashboard)
//   2. Per-client config.excludePrPatterns (Settings field fallback)
//   3. This hardcoded DEFAULT
//
// Remote value is populated by the useRemotePrBlacklist() hook on mount and
// cached here at module scope so every regex build sees the same value.
export const DEFAULT_EXCLUDE_PR_PATTERNS =
  'Bronstein, Gewirtz|Portnoy Law|Securities Class Action|securities fraud lawsuit|rosen, leading trial|glancy prongay|holzer & holzer|investors with substantial|pomerantz law firm|class action filed|suewallst|investor alert|securities fraud|barrack, rodos|shareholders who lost money|berger montague|securities fraud investigation|Kuehn Law|Johnson Fistel|Schall Law Firm|Halper Sadeh|Berger Montague|Johnson Fistel|Pomerantz LLP|investors with losses'

// Module-level cache of the remote patterns. null means "not yet fetched".
// Empty string means "admin explicitly cleared it — fall through to local/default".
let remotePatterns: string | null = null

export function setRemotePrBlacklist(patterns: string | null | undefined) {
  remotePatterns = typeof patterns === 'string' ? patterns : null
}

export function getRemotePrBlacklist(): string | null {
  return remotePatterns
}

// Compile configured pattern into a regex, preferring remote → local → default.
// Returns null if every layer resolves to empty (unusual — default is non-empty).
export function buildExcludePrRegex(configuredPattern?: string): RegExp | null {
  const tryPatterns = [
    remotePatterns,            // 1. admin-dashboard value, if fetched and non-empty
    configuredPattern,         // 2. per-client Settings override
    DEFAULT_EXCLUDE_PR_PATTERNS, // 3. hardcoded fallback
  ]
  const chosen = tryPatterns.find(p => typeof p === 'string' && p.trim().length > 0)
  if (!chosen) return null
  try {
    return new RegExp(chosen, 'i')
  } catch (err) {
    console.warn('excludePrPatterns: invalid regex, falling back to null', err)
    return null
  }
}

// Check if a headline should be dropped by the blacklist.
export function isBlacklistedPr(headline: string | undefined | null, regex: RegExp | null): boolean {
  if (!regex || !headline) return false
  return regex.test(headline)
}
