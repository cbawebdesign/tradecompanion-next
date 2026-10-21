import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { runLoginBackfill, buildBackfillAlerts, __resetBackfillGuards } from '../lib/loginBackfill'
import type { Alert } from '../types'

/**
 * Regression cover for the bug that made the login backfill deliver nothing.
 *
 * The cause was never the server, the store gates or dedup — it was the guard
 * discipline around the fetch:
 *
 *   1. mount with the persisted hubUrl -> "already ran" flag set -> fetch starts
 *   2. CosmosSync loads the user config -> hubUrl changes -> cleanup -> cancelled
 *   3. effect re-runs, sees the flag set, returns without fetching
 *   4. the original fetch resolves, sees cancelled, discards its alerts
 *
 * These tests drive that same sequence directly, which is why the logic was
 * lifted out of the React effect in the first place.
 */

const RESPONSE = {
  ok: true,
  sinceUtc: '2026-10-20T20:00:00',
  scans: [
    { symbol: 'AHT', pct: 65.9, price: 2.97, session: 'AH', alertTimeEt: '2026-10-20T18:54:57', createdUtc: '2026-10-20T22:54:57Z' },
  ],
  catalysts: [
    { symbol: 'SMCI', title: 'Super Micro announces something', notes: 'Confirmed at $37.55', url: 'https://x.test/tc/ampspr?id=abc123', resourceId: 'abc123', modifiedUtc: '2026-10-20T20:43:30Z' },
  ],
}

function mockFetch(body: unknown, ok = true, delayMs = 0) {
  return vi.fn(async () => {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs))
    return { ok, json: async () => body } as unknown as Response
  })
}

describe('runLoginBackfill', () => {
  beforeEach(() => { __resetBackfillGuards() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('applies alerts on a normal run', async () => {
    vi.stubGlobal('fetch', mockFetch(RESPONSE))
    const added: Alert[] = []
    const outcome = await runLoginBackfill('/api', a => added.push(...a))
    expect(outcome).toBe('applied')
    expect(added).toHaveLength(2)
    expect(added.map(a => a.symbol).sort()).toEqual(['AHT', 'SMCI'])
  })

  // THE REGRESSION. A second call arriving while the first is still in flight
  // — which is what the hubUrl change produced — must not stop the first from
  // applying. Previously the re-entry cancelled the winner and nothing landed.
  it('a concurrent second run does not cancel the first', async () => {
    vi.stubGlobal('fetch', mockFetch(RESPONSE, true, 25))
    const added: Alert[] = []
    const first = runLoginBackfill('/api', a => added.push(...a))
    const second = await runLoginBackfill('/api', a => added.push(...a))

    expect(second).toBe('skipped-inflight')   // second backs off
    expect(await first).toBe('applied')       // first still delivers
    expect(added).toHaveLength(2)             // and the timeline gets them
  })

  it('runs only once across repeated effect runs', async () => {
    const f = mockFetch(RESPONSE)
    vi.stubGlobal('fetch', f)
    const added: Alert[] = []
    expect(await runLoginBackfill('/api', a => added.push(...a))).toBe('applied')
    expect(await runLoginBackfill('/api', a => added.push(...a))).toBe('skipped-done')
    expect(f).toHaveBeenCalledTimes(1)
    expect(added).toHaveLength(2)
  })

  // The old code marked itself done BEFORE knowing whether it worked, so one
  // bad response permanently disabled the backfill for that page load.
  it('a failed run leaves a retry possible', async () => {
    vi.stubGlobal('fetch', mockFetch(null, false))
    expect(await runLoginBackfill('/api', () => {})).toBe('failed')

    vi.stubGlobal('fetch', mockFetch(RESPONSE))
    const added: Alert[] = []
    expect(await runLoginBackfill('/api', a => added.push(...a))).toBe('applied')
    expect(added).toHaveLength(2)
  })

  it('an empty window is not treated as done', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true, sinceUtc: 'x', scans: [], catalysts: [] }))
    expect(await runLoginBackfill('/api', () => {})).toBe('empty')

    vi.stubGlobal('fetch', mockFetch(RESPONSE))
    expect(await runLoginBackfill('/api', () => {})).toBe('applied')
  })
})

describe('buildBackfillAlerts', () => {
  it('keys scans so they collapse with the live gainScanner alert', () => {
    const [a] = buildBackfillAlerts({ ok: true, scans: RESPONSE.scans, catalysts: [] })
    expect(a.dedupKey).toBe(`gain:AHT:${new Date('2026-10-20T18:54:57').toDateString()}`)
    expect(a.type).toBe('scanner')
    expect(a.message).toBe('▲ 66% intraday — $2.97')
  })

  it('keys catalysts on the story id, matching buildConfirmedAlert', () => {
    const [a] = buildBackfillAlerts({ ok: true, scans: [], catalysts: RESPONSE.catalysts })
    expect(a.dedupKey).toBe('cat:rid:abc123')
    expect(a.url).toBe('/api/pr?id=abc123')
    expect(a.message).toContain('($37.55)')
  })

  it('skips rows with no symbol or an unparseable date', () => {
    const out = buildBackfillAlerts({
      ok: true,
      scans: [{ symbol: '', pct: 1, price: 1, session: '', alertTimeEt: '2026-10-20T10:00:00', createdUtc: '' } as any,
              { symbol: 'X', pct: 1, price: 1, session: '', alertTimeEt: 'not-a-date', createdUtc: 'also-bad' } as any],
      catalysts: [],
    })
    expect(out).toHaveLength(0)
  })
})

describe('intra-batch dedup', () => {
  // Seen live: two Catalyst PR rows for the same Supermicro release, minutes
  // apart, one with no id in its Link so it keyed differently. addAlerts only
  // dedups against the EXISTING store, not within the incoming batch, so both
  // would have landed.
  const sameStory = (over: Record<string, unknown>) => ({
    symbol: 'SMCI',
    title: 'Supermicro Provides First Quarter of Fiscal Year 2027 Preliminary Business Update',
    notes: '',
    url: '',
    resourceId: '',
    modifiedUtc: '2026-10-20T20:30:12Z',
    ...over,
  })

  it('collapses two rows describing the same story', () => {
    const out = buildBackfillAlerts({
      ok: true,
      scans: [],
      catalysts: [
        sameStory({ modifiedUtc: '2026-10-20T20:43:30Z' }) as any,
        sameStory({ resourceId: '02788adf' }) as any,
      ],
    })
    expect(out).toHaveLength(1)
  })

  it('keeps the copy that has a story id', () => {
    const [a] = buildBackfillAlerts({
      ok: true,
      scans: [],
      catalysts: [
        sameStory({ modifiedUtc: '2026-10-20T20:43:30Z' }) as any,
        sameStory({ resourceId: '02788adf' }) as any,
      ],
    })
    expect(a.dedupKey).toBe('cat:rid:02788adf')
    expect(a.url).toBe('/api/pr?id=02788adf')
  })

  it('does not collapse genuinely different stories on one symbol', () => {
    const out = buildBackfillAlerts({
      ok: true,
      scans: [],
      catalysts: [
        sameStory({ resourceId: 'aaa' }) as any,
        sameStory({ resourceId: 'bbb', title: 'Supermicro announces something else' }) as any,
      ],
    })
    expect(out).toHaveLength(2)
  })
})
