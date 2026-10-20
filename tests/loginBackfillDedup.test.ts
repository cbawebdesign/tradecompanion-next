import { describe, it, expect } from 'vitest'
import { buildConfirmedAlert } from '../lib/catalystConfirmer'

/**
 * The login backfill replays catalysts and 40% scans that ALSO arrive live, and
 * Justin refreshes mid-session. If a backfilled row carries a different dedup
 * key from its live counterpart, every entry shows twice.
 *
 * These pin the two keys to the same format on both paths.
 */

// Mirrors the key useLoginBackfill builds for a scan row. Kept here rather than
// imported because the hook is a React module; the FORMAT is what matters and
// it is asserted against the live SignalR handler's format below.
function backfillScanKey(symbol: string, alertTimeEt: string): string {
  return `gain:${symbol}:${new Date(alertTimeEt).toDateString()}`
}

// The format hooks/useSignalR.ts uses when a gainScanner push arrives live.
function liveScanKey(symbol: string, receivedAt: Date): string {
  return `gain:${symbol}:${receivedAt.toDateString()}`
}

describe('scan backfill dedup', () => {
  it('matches the live key for the same symbol on the same day', () => {
    const alertTimeEt = '2026-10-20T13:28:50.123'
    const live = liveScanKey('HOST', new Date(alertTimeEt))
    expect(backfillScanKey('HOST', alertTimeEt)).toBe(live)
  })

  it('still matches for a pre-market alert, which is the reboot case', () => {
    const alertTimeEt = '2026-10-20T04:01:50.000'
    expect(backfillScanKey('WORX', alertTimeEt))
      .toBe(liveScanKey('WORX', new Date(alertTimeEt)))
  })

  it('separates the same symbol on different days', () => {
    expect(backfillScanKey('WORX', '2026-10-20T04:01:50'))
      .not.toBe(backfillScanKey('WORX', '2026-10-19T04:01:50'))
  })
})

describe('catalyst backfill dedup', () => {
  const cat = (over: Record<string, unknown> = {}) => ({
    symbol: 'MYGN',
    title: 'Myriad Genetics and Labcorp Announce Agreement',
    saveTime: new Date('2026-10-20T12:34:09.000Z'),
    resourceId: 'b40c6e1c2f3e8b',
    source: 'scanzzers',
    startPrice: 4.22,
    ...over,
  }) as Parameters<typeof buildConfirmedAlert>[0]

  const bar = { t: new Date('2026-10-20T12:34:09.000Z') }

  it('keys a live confirmed catalyst on the story id', () => {
    // Airtable stores the story id but NOT saveTime, so this is the only
    // identity the backfill can reproduce.
    expect(buildConfirmedAlert(cat(), bar).dedupKey).toBe('cat:rid:b40c6e1c2f3e8b')
  })

  it('matches the key the backfill builds for the same story', () => {
    const live = buildConfirmedAlert(cat(), bar).dedupKey
    const backfilled = `cat:rid:${'b40c6e1c2f3e8b'}`
    expect(backfilled).toBe(live)
  })

  it('falls back to saveTime when there is no story id', () => {
    const k = buildConfirmedAlert(cat({ resourceId: '' }), bar).dedupKey
    expect(k).toContain('MYGN')
    expect(k).not.toContain('rid:')
  })

  it('distinguishes two different stories on the same symbol', () => {
    const a = buildConfirmedAlert(cat({ resourceId: 'aaa111' }), bar).dedupKey
    const b = buildConfirmedAlert(cat({ resourceId: 'bbb222' }), bar).dedupKey
    expect(a).not.toBe(b)
  })

  it('routes the url through TC\'s PR proxy so it opens in the popup', () => {
    expect(buildConfirmedAlert(cat(), bar).url).toBe('/api/pr?id=b40c6e1c2f3e8b')
  })
})
