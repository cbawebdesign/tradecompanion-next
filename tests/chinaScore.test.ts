import { describe, it, expect } from 'vitest'
import { formatChinaScore } from '../components/StockDataRibbon'

/**
 * Display rules for the China Reports "Score" column.
 *
 * Shape checked against the live base (588 rows, 2026-10-20): every row has a
 * Score, it always arrives as a JSON number, and the values run 0.0 to 9.5 as a
 * mix of integers (8, 9, 0) and one-decimal floats (6.5, 7.8).
 */
describe('formatChinaScore', () => {
  it('renders a one-decimal score the way Justin wrote it', () => {
    expect(formatChinaScore(8.5)).toBe('8.5/10')
  })

  it('drops the decimal on a whole number rather than showing 8.0', () => {
    expect(formatChinaScore(8)).toBe('8/10')
  })

  it('renders a genuine zero, which is a real score in the base', () => {
    // Distinct from "no China record", which renders nothing at all.
    expect(formatChinaScore(0)).toBe('0/10')
  })

  it('covers the observed range ends', () => {
    expect(formatChinaScore(9.5)).toBe('9.5/10')
    expect(formatChinaScore(7.8)).toBe('7.8/10')
  })

  it('rounds a stray extra decimal to one place', () => {
    expect(formatChinaScore(6.449)).toBe('6.4/10')
    expect(formatChinaScore(6.46)).toBe('6.5/10')
    // 6.55 rounds DOWN, because the nearest double to 6.55 is a hair below it
    // and toFixed rounds the actual stored value. Pinned rather than worked
    // around: the live base only ever stores one decimal, so no real score can
    // hit this, and hand-rolling decimal rounding to fix a case that cannot
    // occur would be the worse trade.
    expect(formatChinaScore(6.55)).toBe('6.5/10')
  })

  it('does not emit a trailing .0 after rounding', () => {
    expect(formatChinaScore(7.02)).toBe('7/10')
  })
})
