import { decodeEntities } from './formatAlertText'

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

// Memoize the compiled regex keyed on the resolved pattern string. The store
// now runs the blacklist on EVERY incoming alert (see shouldBlacklistAlert),
// so recompiling `new RegExp(...)` per alert would be wasteful on high-volume
// feeds. The pattern only changes when the admin edits it or the user changes
// Settings, so a single-entry cache is effectively free after first use.
let cachedRegex: { key: string; regex: RegExp | null } | null = null

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
  if (cachedRegex && cachedRegex.key === chosen) return cachedRegex.regex
  let regex: RegExp | null
  try {
    regex = new RegExp(chosen, 'i')
  } catch (err) {
    console.warn('excludePrPatterns: invalid regex, falling back to null', err)
    regex = null
  }
  cachedRegex = { key: chosen, regex }
  return regex
}

// Alert types that carry PR / news / catalyst headlines — the surfaces the
// ambulance-chaser blacklist is meant to clean. Everything else is exempt:
//   - tweet   : FinTwit legitimately discusses "securities fraud" / "investor alert"
//   - rss/mail: Justin's curated YouTube / Substack / Articles feeds
//   - price/scanner/tradingview/trade_exchange: not headlines
const BLACKLISTABLE_TYPES = new Set(['news', 'catalyst', 'filing'])

// Central decision used by the store's addAlert/addAlerts so EVERY ingest path
// (catalyst polling, the alert auditor, all SignalR frames, newsHub) drops
// blacklisted PRs — not just the two hooks that filtered inline. This was the
// real "ambulance-chaser filter does nothing" bug: catalyst PRs (e.g. $CAPR
// "securities fraud") arrive via a path that never filtered.
export function shouldBlacklistAlert(
  type: string,
  message: string | undefined | null,
  configuredPattern?: string,
): boolean {
  if (!BLACKLISTABLE_TYPES.has(type)) return false
  return isBlacklistedPr(message, buildExcludePrRegex(configuredPattern))
}

// Check if a headline should be dropped by the blacklist. Decode HTML entities
// first: headlines now arrive with `&amp;`/`&#39;` encoding, but the patterns
// use plain `&`/`'`, so law-firm names like "Levi & Korinsky" stopped matching
// once the feed started encoding — the "ambulance-chaser filter broke" bug.
export function isBlacklistedPr(headline: string | undefined | null, regex: RegExp | null): boolean {
  if (!regex || !headline) return false
  return regex.test(decodeEntities(headline))
}
