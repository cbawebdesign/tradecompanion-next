import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_EXCLUDE_PR_PATTERNS,
  buildExcludePrRegex,
  isBlacklistedPr,
  shouldBlacklistAlert,
  setRemotePrBlacklist,
} from '@/lib/excludePrPatterns'

/**
 * CHARACTERIZATION TESTS — lib/excludePrPatterns.ts
 *
 * The ambulance-chaser / class-action PR blacklist. This has broken twice in
 * production in ways nobody noticed for a while:
 *   1. HTML entities — headlines started arriving with `&amp;`, so law-firm
 *      names containing "&" silently stopped matching.
 *   2. Coverage — catalyst PRs arrived via a path that never filtered, so the
 *      blacklist "did nothing" for the alerts that mattered.
 * Both are pinned below.
 */

beforeEach(() => setRemotePrBlacklist(null)) // reset module-level remote cache

describe('isBlacklistedPr', () => {
  const rx = () => buildExcludePrRegex()

  it('blocks the default law-firm names', () => {
    expect(isBlacklistedPr('Pomerantz Law Firm announces investigation of Acme', rx())).toBe(true)
    expect(isBlacklistedPr('ACME investors with substantial losses should contact', rx())).toBe(true)
    expect(isBlacklistedPr('Schall Law Firm reminds investors', rx())).toBe(true)
  })

  it('lets a real catalyst through', () => {
    expect(isBlacklistedPr('Acme announces FDA approval of ACME-101', rx())).toBe(false)
    expect(isBlacklistedPr('Acme reports record Q3 revenue', rx())).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isBlacklistedPr('POMERANTZ LAW FIRM ANNOUNCES', rx())).toBe(true)
  })

  it('decodes HTML entities before matching', () => {
    // THE BUG: feeds began encoding headlines, so "Levi &amp; Korsinsky" no
    // longer matched a pattern written with a bare "&". Anything with an
    // ampersand in the firm name slipped straight through.
    expect(isBlacklistedPr('Holzer &amp; Holzer LLC announces investigation', rx())).toBe(true)
    expect(isBlacklistedPr('Holzer & Holzer LLC announces investigation', rx())).toBe(true)
  })

  it('returns false for empty headline or null regex', () => {
    expect(isBlacklistedPr('', rx())).toBe(false)
    expect(isBlacklistedPr(null, rx())).toBe(false)
    expect(isBlacklistedPr('Pomerantz Law Firm', null)).toBe(false)
  })
})

describe('buildExcludePrRegex — precedence', () => {
  it('falls back to the hardcoded default', () => {
    expect(buildExcludePrRegex()?.source).toBe(DEFAULT_EXCLUDE_PR_PATTERNS)
  })

  it('a per-client Settings value overrides the default', () => {
    expect(buildExcludePrRegex('zzz-custom')?.source).toBe('zzz-custom')
  })

  it('an empty Settings value falls through to the default, not to nothing', () => {
    // Otherwise clearing the Settings box would silently disable the filter.
    expect(buildExcludePrRegex('')?.source).toBe(DEFAULT_EXCLUDE_PR_PATTERNS)
    expect(buildExcludePrRegex('   ')?.source).toBe(DEFAULT_EXCLUDE_PR_PATTERNS)
  })

  it('the remote admin value wins over both', () => {
    setRemotePrBlacklist('remote-wins')
    expect(buildExcludePrRegex('client-value')?.source).toBe('remote-wins')
  })

  it('an empty remote value falls through to the client value', () => {
    setRemotePrBlacklist('')
    expect(buildExcludePrRegex('client-value')?.source).toBe('client-value')
  })

  it('an invalid regex degrades to null instead of throwing', () => {
    // A bad pattern typed into the admin box must not take the app down.
    setRemotePrBlacklist('([unclosed')
    expect(buildExcludePrRegex()).toBeNull()
  })
})

describe('shouldBlacklistAlert — which surfaces get filtered', () => {
  it('filters news, catalyst and filing', () => {
    // Catalyst is the one that matters: those PRs arrived via a path that
    // never filtered, which is why the blacklist appeared to do nothing.
    expect(shouldBlacklistAlert('news', 'Pomerantz Law Firm announces')).toBe(true)
    expect(shouldBlacklistAlert('catalyst', 'Pomerantz Law Firm announces')).toBe(true)
    expect(shouldBlacklistAlert('filing', 'Pomerantz Law Firm announces')).toBe(true)
  })

  it('EXEMPTS tweets — FinTwit legitimately says "securities fraud"', () => {
    expect(shouldBlacklistAlert('tweet', 'Pomerantz Law Firm announces')).toBe(false)
  })

  it("EXEMPTS Justin's curated rss and mail feeds", () => {
    expect(shouldBlacklistAlert('rss', 'Pomerantz Law Firm announces')).toBe(false)
    expect(shouldBlacklistAlert('mail', 'Pomerantz Law Firm announces')).toBe(false)
  })

  it('exempts non-headline types', () => {
    for (const t of ['price', 'scanner', 'tradingview', 'trade_exchange']) {
      expect(shouldBlacklistAlert(t, 'Pomerantz Law Firm announces')).toBe(false)
    }
  })
})
