import { describe, it, expect, vi } from 'vitest'
import { fmtPct, sortMembers, splitByCap, pctCellStyle, pillColors, type ThemeMember } from '@/lib/themePerformance'

/** Theme pills + popup (meeting 10/31), formatted like Justin's Theme Performance report. */

const m = (symbol: string, cap: string, today: number | null, m1: number | null = null): ThemeMember =>
  ({ symbol, company: symbol, cap, today, m1 })

describe('fmtPct', () => {
  it('one decimal with a sign, like his report', () => {
    expect(fmtPct(1.74)).toBe('+1.7%')
    expect(fmtPct(-0.44)).toBe('-0.4%')
    expect(fmtPct(20.4)).toBe('+20.4%')
  })
  it('no value is a dash', () => {
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(undefined)).toBe('—')
  })
})

describe('large caps on top, small caps under the arrow', () => {
  it('splits by the Airtable view', () => {
    const { large, small } = splitByCap([m('IREN', 'large', 1), m('KEEL', 'small', 2), m('HUT', 'large', 3)])
    expect(large.map(x => x.symbol)).toEqual(['IREN', 'HUT'])
    expect(small.map(x => x.symbol)).toEqual(['KEEL'])
  })
})

describe('sortMembers', () => {
  const rows = [m('A', 'large', 1.5), m('B', 'large', null), m('C', 'large', -2), m('D', 'large', 4)]
  it('Today, biggest gainer first, by default', () => {
    expect(sortMembers(rows, 'today', true).map(x => x.symbol)).toEqual(['D', 'A', 'C', 'B'])
  })
  it('ascending keeps missing values last', () => {
    expect(sortMembers(rows, 'today', false).map(x => x.symbol)).toEqual(['C', 'A', 'D', 'B'])
  })
  it('does not mutate the input', () => {
    sortMembers(rows, 'today', true)
    expect(rows.map(x => x.symbol)).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('report colours', () => {
  it('green up, red down, nothing for flat or missing', () => {
    expect(pctCellStyle(5).background).toContain('34, 197, 94')
    expect(pctCellStyle(-5).background).toContain('239, 68, 68')
    expect(pctCellStyle(0)).toEqual({})
    expect(pctCellStyle(null)).toEqual({})
  })
  it('bigger moves are stronger', () => {
    const alpha = (v: number) => Number(/([\d.]+)\)$/.exec(pctCellStyle(v).background!)![1])
    expect(alpha(20)).toBeGreaterThan(alpha(2))
    expect(alpha(300)).toBe(alpha(25))   // saturates
  })
  it('a theme keeps the same pill colour everywhere', () => {
    expect(pillColors('Datacenters')).toEqual(pillColors('Datacenters'))
    expect(pillColors('Datacenters').color).not.toBe(pillColors('Neocloud').color)
  })
})

// ── Themes report (Justin's build criteria, 11/17) ──────────────────────────

import { fetchThemeReport, sortMembersBy, sortThemeRows, type ThemeRow } from '@/lib/themePerformance'

const rows: ThemeRow[] = [
  { theme: 'Railroads', count: 8, large: 8, today: 0.1, topSymbol: 'UNP', topToday: 0.9 },
  { theme: 'Adtech', count: 29, large: 29, today: 0.4, topSymbol: 'TTD', topToday: -3.1 },
  { theme: 'Healthcare', count: 8, large: 8, today: 1.9, topSymbol: 'UNH', topToday: 2.2 },
  { theme: 'Blank', count: 3, large: 3, today: null, topSymbol: null, topToday: null },
]
const names = (r: ThemeRow[]) => r.map(t => t.theme)

describe('Themes report sort', () => {
  it('defaults to Today, biggest first, blanks last', () => {
    expect(names(sortThemeRows(rows, 'today', true))).toEqual(['Healthcare', 'Adtech', 'Railroads', 'Blank'])
  })
  it('keeps blanks last when the column is flipped', () => {
    expect(names(sortThemeRows(rows, 'today', false))).toEqual(['Railroads', 'Adtech', 'Healthcare', 'Blank'])
  })
  it('sorts Theme A–Z, then Z–A', () => {
    expect(names(sortThemeRows(rows, 'theme', false))).toEqual(['Adtech', 'Blank', 'Healthcare', 'Railroads'])
    expect(names(sortThemeRows(rows, 'theme', true))).toEqual(['Railroads', 'Healthcare', 'Blank', 'Adtech'])
  })
  it('sorts Top Mover by its move', () => {
    expect(names(sortThemeRows(rows, 'top', true))).toEqual(['Healthcare', 'Railroads', 'Adtech', 'Blank'])
  })
})

describe('Themes report member sort', () => {
  const ms = [
    { symbol: 'B', company: '', cap: 'large', today: 1, w1: null },
    { symbol: 'A', company: '', cap: 'large', today: 3, w1: 2 },
    { symbol: 'C', company: '', cap: 'large', today: -2, w1: 5 },
  ] as ThemeMember[]
  it('follows the theme table column and direction, missing last', () => {
    expect(sortMembersBy(ms, 'w1', true).map(m => m.symbol)).toEqual(['C', 'A', 'B'])
    expect(sortMembersBy(ms, 'w1', false).map(m => m.symbol)).toEqual(['A', 'C', 'B'])
  })
  it('Theme sorts members by symbol; Top Mover by Today', () => {
    expect(sortMembersBy(ms, 'theme', false).map(m => m.symbol)).toEqual(['A', 'B', 'C'])
    expect(sortMembersBy(ms, 'top', true).map(m => m.symbol)).toEqual(['A', 'B', 'C'])
  })
})

describe('fetchThemeReport', () => {
  it('asks for fresh prices and hides themes with no TC Large Caps member', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      asOfUtc: '2026-11-16T23:38:00Z', session: 'closed', sessionDate: '2026-11-16',
      themes: [{ theme: 'A', count: 3, large: 2 }, { theme: 'SmallOnly', count: 4, large: 0 }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    const r = await fetchThemeReport('https://worker.example/api')
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('ThemePerformance?fresh=1')
    expect(r.themes.map(t => t.theme)).toEqual(['A'])
    expect(r.session).toBe('closed')
    vi.unstubAllGlobals()
  })
})
