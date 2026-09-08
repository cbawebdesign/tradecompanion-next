import { describe, it, expect } from 'vitest'
import { headlineMatch, isFilteredPrMatch } from '@/lib/filteredPr'

/**
 * CHARACTERIZATION TESTS — lib/filteredPr.ts
 *
 * Justin's own keyword rules, ported from the legacy C# FilteredPR.cs.
 * Syntax: comma or pipe = OR, & = AND, ! prefix = NOT, * = wildcard.
 *
 * These are HIS filters — if the semantics drift from the desktop app he
 * gets different alerts on web than on legacy and has no way to know why.
 */

describe('headlineMatch — OR', () => {
  it('matches on any comma-separated term', () => {
    expect(headlineMatch('Acme wins FDA approval', 'approval,contract')).toBe(true)
    expect(headlineMatch('Acme wins contract', 'approval,contract')).toBe(true)
    expect(headlineMatch('Acme reports earnings', 'approval,contract')).toBe(false)
  })

  it('treats pipe the same as comma', () => {
    expect(headlineMatch('Acme wins contract', 'approval|contract')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(headlineMatch('ACME WINS FDA APPROVAL', 'approval')).toBe(true)
  })
})

describe('headlineMatch — AND', () => {
  it('requires every &-separated group to match', () => {
    expect(headlineMatch('Acme wins FDA approval', 'fda&approval')).toBe(true)
    expect(headlineMatch('Acme wins EU approval', 'fda&approval')).toBe(false)
  })

  it('combines AND across OR groups', () => {
    expect(headlineMatch('Acme wins FDA contract', 'fda&approval,contract')).toBe(true)
    expect(headlineMatch('Acme wins EU contract', 'fda&approval,contract')).toBe(false)
  })
})

describe('headlineMatch — NOT', () => {
  it('excludes when a ! term matches', () => {
    expect(headlineMatch('Acme wins contract', 'contract,!terminated')).toBe(true)
    expect(headlineMatch('Acme contract terminated', 'contract,!terminated')).toBe(false)
  })

  it('a NOT match beats a positive match in the same group', () => {
    expect(headlineMatch('Acme contract terminated', 'contract,!terminated')).toBe(false)
  })
})

describe('headlineMatch — wildcard', () => {
  it('* expands to .*', () => {
    expect(headlineMatch('Acme announces acquisition', 'acqui*')).toBe(true)
    expect(headlineMatch('Acme announces acquires', 'acqui*')).toBe(true)
  })

  it('escapes regex metacharacters so they are literal', () => {
    // Without the escape, a filter containing (, ), + or $ would either throw
    // or silently match the wrong things.
    expect(headlineMatch('Acme (Q3) results', '(q3)')).toBe(true)
    expect(headlineMatch('Acme +20% today', '+20%')).toBe(true)
    expect(headlineMatch('Acme $5.00 offering', '$5.00')).toBe(true)
  })
})

describe('headlineMatch — empty inputs', () => {
  it('an empty filter never matches', () => {
    // Important: an empty filter must not match everything, or a user with no
    // FilteredPR configured would get a duplicate alert for every headline.
    expect(headlineMatch('anything at all', '')).toBe(false)
    expect(headlineMatch('anything at all', '   ')).toBe(false)
  })
})

describe('isFilteredPrMatch', () => {
  it('reports which side matched', () => {
    const r = isFilteredPrMatch('Acme wins FDA approval', 'approval', 'lawsuit')
    expect(r).toEqual({ matched: true, isPositive: true, isNegative: false })
  })

  it('reports a negative match', () => {
    const r = isFilteredPrMatch('Acme faces lawsuit', 'approval', 'lawsuit')
    expect(r).toEqual({ matched: true, isPositive: false, isNegative: true })
  })

  it('can be BOTH positive and negative at once', () => {
    // CURRENT BEHAVIOUR — documenting, not endorsing. The alert renders as
    // "[+-]" and takes the negative colour. Worth a decision if it ever
    // confuses him.
    const r = isFilteredPrMatch('Acme wins approval despite lawsuit', 'approval', 'lawsuit')
    expect(r).toEqual({ matched: true, isPositive: true, isNegative: true })
  })

  it('no match when neither side hits', () => {
    const r = isFilteredPrMatch('Acme reports earnings', 'approval', 'lawsuit')
    expect(r).toEqual({ matched: false, isPositive: false, isNegative: false })
  })
})
