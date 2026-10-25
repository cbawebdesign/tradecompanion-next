import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { formatClock, formatClockWithDate } from '../lib/formatTime'

const at = (h: number, m: number, s = 0) => {
  const d = new Date(); d.setHours(h, m, s, 0); return d
}

describe('formatClock', () => {
  it('is 24-hour, not AM/PM', () => {
    // "instead of 11:00 PM, just have the UI display 23:00"
    expect(formatClock(at(23, 0, 0))).toBe('23:00:00')
    expect(formatClock(at(11, 30, 0))).toBe('11:30:00')
    expect(formatClock(at(16, 5, 9))).toBe('16:05:09')
  })

  it('renders midnight as 00, never 24', () => {
    // en-US with hour12:false gives "24:00:00" in V8, which reads as tomorrow.
    // hourCycle h23 is what pins this.
    expect(formatClock(at(0, 0, 0))).toBe('00:00:00')
    expect(formatClock(at(0, 5, 12))).toBe('00:05:12')
  })

  it('zero-pads so rows stay aligned', () => {
    // The whole point is column width; a 1-char hour would break it.
    expect(formatClock(at(9, 30, 0))).toBe('09:30:00')
  })

  it('carries no AM/PM marker at all', () => {
    for (const h of [0, 1, 9, 12, 13, 23]) {
      expect(formatClock(at(h, 0, 0))).not.toMatch(/[ap]\.?m\.?/i)
    }
  })

  it('returns empty rather than "Invalid Date"', () => {
    expect(formatClock('not a date')).toBe('')
    expect(formatClock(NaN)).toBe('')
  })
})

describe('formatClockWithDate', () => {
  it('leaves today time-only', () => {
    expect(formatClockWithDate(at(14, 2, 3))).toBe('14:02:03')
  })

  it('prefixes an older row with MM/DD/YY', () => {
    const d = new Date(); d.setDate(d.getDate() - 3); d.setHours(21, 4, 5, 0)
    expect(formatClockWithDate(d)).toMatch(/^\d{2}\/\d{2}\/\d{2} 21:04:05$/)
  })
})

describe('one formatter, not four', () => {
  it('no component still formats a clock inline', () => {
    // It was copied into four files; changing it in three of them is the bug
    // this prevents.
    for (const f of ['AlertBar.tsx', 'AlertsPage.tsx', 'Watchlist.tsx', 'MonitorPage.tsx']) {
      const src = readFileSync(join(__dirname, '..', 'components', f), 'utf8')
      expect(src).not.toContain('toLocaleTimeString')
    }
  })
})
