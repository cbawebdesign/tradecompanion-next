import { describe, it, expect } from 'vitest'
import { normalizeAlertMessage, alertMatchKey } from '@/lib/alertDedup'

/**
 * CHARACTERIZATION TESTS — lib/alertDedup.ts
 *
 * These lock in what the code does TODAY. Every clause in these functions
 * exists because of a specific reported bug, and none of it was protected
 * before now. A change that breaks one of these tests is dropping or
 * duplicating alerts in production, silently.
 *
 * Each test names the bug it guards.
 */

describe('normalizeAlertMessage', () => {
  it('strips a leading [Source] prefix', () => {
    // Trade Exchange sends "[TX-News1] ...", and the SignalR frame sometimes
    // drops the prefix entirely when `source` is empty — so the same post
    // arrived once with a bracket and once without, and dedup missed it.
    expect(normalizeAlertMessage('[TX-News1] Acme beats on earnings'))
      .toBe('acme beats on earnings')
    expect(normalizeAlertMessage('[Benzinga] Acme beats on earnings'))
      .toBe('acme beats on earnings')
  })

  it('strips [+] and [-] so a FilteredPR copy collapses against the plain PR', () => {
    // Justin's "[+] duplicate": the filtered copy tags the same headline as
    // "[+] ..." and showed twice in the data ribbon.
    expect(normalizeAlertMessage('[+] Acme wins contract')).toBe('acme wins contract')
    expect(normalizeAlertMessage('[-] Acme sued')).toBe('acme sued')
    expect(normalizeAlertMessage('[+-] Acme mixed')).toBe('acme mixed')
  })

  it('strips a trailing ($12.34) price suffix', () => {
    // The catalyst confirmer appends the trigger price; the DB row stores
    // just the title.
    expect(normalizeAlertMessage('Acme beats ($12.34)')).toBe('acme beats')
    expect(normalizeAlertMessage('Acme beats ($7)')).toBe('acme beats')
  })

  it('collapses whitespace and lowercases', () => {
    expect(normalizeAlertMessage('  Acme   BEATS \n on earnings ')).toBe('acme beats on earnings')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeAlertMessage(null)).toBe('')
    expect(normalizeAlertMessage(undefined)).toBe('')
    expect(normalizeAlertMessage('')).toBe('')
  })

  it('does NOT strip a bracket that is not a source tag', () => {
    // Guards against the prefix regex getting greedy and eating real content.
    expect(normalizeAlertMessage('Acme [update] beats')).toBe('acme [update] beats')
  })

  it('strips only ONE leading prefix, not a chain', () => {
    // CURRENT BEHAVIOUR — documenting, not endorsing. If a message ever
    // arrives double-prefixed, the second tag survives into the key.
    expect(normalizeAlertMessage('[TX] [+] Acme beats')).toBe('[+] acme beats')
  })
})

describe('alertMatchKey', () => {
  it('builds symbol|type|first-40-of-normalized-message', () => {
    expect(alertMatchKey('AAPL', 'news', '[Benzinga] Apple beats'))
      .toBe('AAPL|news|apple beats')
  })

  it('truncates the message at 40 characters', () => {
    const long = 'a'.repeat(60)
    const key = alertMatchKey('AAPL', 'news', long)
    expect(key).toBe(`AAPL|news|${'a'.repeat(40)}`)
  })

  it('strips SEC form codes for filings so both feeds key the same', () => {
    // Filings are stored as "8-K: {title}" on the live/poll path but arrive as
    // just "{title}" from the per-symbol REST feed. Without this, the auditor
    // re-injected filings the user had deleted.
    expect(alertMatchKey('AAPL', 'filing', '8-K: Material agreement'))
      .toBe(alertMatchKey('AAPL', 'filing', 'Material agreement'))
  })

  it('handles the amended /A form variants', () => {
    expect(alertMatchKey('AAPL', 'filing', '10-Q/A: Restated results'))
      .toBe('AAPL|filing|restated results')
  })

  it('strips bare numeric ownership forms (3/4/5/6)', () => {
    expect(alertMatchKey('AAPL', 'filing', '4: Statement of changes'))
      .toBe('AAPL|filing|statement of changes')
  })

  it('does NOT strip form codes for non-filing types', () => {
    // The strip is deliberately scoped to filings so a PR whose headline
    // happens to start with a form code keeps its text.
    expect(alertMatchKey('AAPL', 'news', '8-K: Material agreement'))
      .toBe('AAPL|news|8-k: material agreement')
  })

  it('is case-insensitive on the message but NOT on the symbol', () => {
    // CURRENT BEHAVIOUR: symbol is interpolated raw. Callers are expected to
    // pass an already-uppercased symbol; if they don't, keys won't match.
    expect(alertMatchKey('AAPL', 'news', 'Beats')).toBe('AAPL|news|beats')
    expect(alertMatchKey('aapl', 'news', 'Beats')).toBe('aapl|news|beats')
    expect(alertMatchKey('AAPL', 'news', 'Beats')).not.toBe(alertMatchKey('aapl', 'news', 'Beats'))
  })
})
