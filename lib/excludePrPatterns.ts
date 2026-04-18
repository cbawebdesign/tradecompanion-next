// Default ambulance-chaser / class-action PR blacklist.
// Pipe-delimited regex alternation, case-insensitive.
// Overridable via config.excludePrPatterns (empty string = use default).
// Mirrors Util.DEFAULT_EXCLUDE_PR_PATTERNS in the legacy desktop app.
export const DEFAULT_EXCLUDE_PR_PATTERNS =
  'Bronstein, Gewirtz|Portnoy Law|Securities Class Action|securities fraud lawsuit|rosen, leading trial|glancy prongay|holzer & holzer|investors with substantial|pomerantz law firm|class action filed|suewallst|investor alert|securities fraud|barrack, rodos|shareholders who lost money|berger montague|securities fraud investigation|Kuehn Law|Johnson Fistel|Schall Law Firm|Halper Sadeh|Berger Montague|Johnson Fistel|Pomerantz LLP|investors with losses'

// Compile configured pattern into a regex. Returns null if empty/invalid.
export function buildExcludePrRegex(configuredPattern?: string): RegExp | null {
  const pattern = configuredPattern && configuredPattern.trim().length > 0
    ? configuredPattern
    : DEFAULT_EXCLUDE_PR_PATTERNS
  if (!pattern.trim()) return null
  try {
    return new RegExp(pattern, 'i')
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
