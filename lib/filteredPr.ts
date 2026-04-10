// FilteredPR keyword matching — ported from legacy FilteredPR.cs
// Filter syntax:
//   comma (,) or pipe (|) = OR
//   ampersand (&) = AND (all groups must match)
//   exclamation (!) prefix = NOT (exclude if matched)
//   asterisk (*) = wildcard (converted to .* regex)

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(escaped, 'i')
}

// Check if a headline matches a single group (comma/pipe separated OR terms with ! exclusions)
function matchGroup(headline: string, group: string): boolean {
  const parts = group.split(/[,|]/)
  const includes = parts.filter(p => p.trim() && !p.trim().startsWith('!'))
  const excludes = parts.filter(p => p.trim().startsWith('!')).map(p => p.trim().slice(1))

  let matchFound = false

  // Check positive matches (any one = match)
  for (const include of includes) {
    const trimmed = include.trim()
    if (!trimmed) continue
    if (wildcardToRegex(trimmed).test(headline)) {
      matchFound = true
      break
    }
  }

  // Check negative matches (any one = no match)
  for (const exclude of excludes) {
    const trimmed = exclude.trim()
    if (!trimmed) continue
    if (wildcardToRegex(trimmed).test(headline)) {
      matchFound = false
      break
    }
  }

  return matchFound
}

// Main match function — all AND groups must match
export function headlineMatch(headline: string, filter: string): boolean {
  if (!filter || !filter.trim()) return false

  const andGroups = filter.split('&')
  for (const group of andGroups) {
    if (!group.trim()) continue
    if (!matchGroup(headline, group)) return false
  }
  return true
}

// Check if a headline matches either positive or negative filter
export function isFilteredPrMatch(
  headline: string,
  positiveFilter: string,
  negativeFilter: string
): { matched: boolean; isPositive: boolean; isNegative: boolean } {
  const positiveMatch = headlineMatch(headline, positiveFilter)
  const negativeMatch = headlineMatch(headline, negativeFilter)
  return {
    matched: positiveMatch || negativeMatch,
    isPositive: positiveMatch,
    isNegative: negativeMatch,
  }
}
