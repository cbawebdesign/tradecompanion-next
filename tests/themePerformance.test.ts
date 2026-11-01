import { describe, it, expect } from 'vitest'
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
