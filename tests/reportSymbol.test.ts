import { describe, it, expect } from 'vitest'
import { parseReportSymbol, resolveReportSymbol, isTradeableSymbol } from '@/lib/reportSymbol'

/**
 * Justin's bots title Airtable reports "SYMBOL: rest of the title". Before this
 * parser every row from a view carried one hardcoded placeholder — SUB, YT,
 * NEWS — so a report about MSS showed up tagged SUB, could not load a chart on
 * click, and gave AHK no ticker to fire on.
 *
 * The important cases here are the NEGATIVE ones. Falling back to a placeholder
 * is harmless; putting the wrong ticker on an alert makes it look like news
 * about a company it has nothing to do with, which is worse than no symbol.
 */

describe('parseReportSymbol — the cases from the spec', () => {
  it('pulls the ticker from the examples Justin gave', () => {
    expect(parseReportSymbol('MSS: China')).toBe('MSS')
    expect(parseReportSymbol('MBRX: Mexico patent for liposomal Annamycin to 2040')).toBe('MBRX')
    expect(parseReportSymbol('ZEO: Retires $1.67M White Lion convertible debt')).toBe('ZEO')
  })

  it('accepts 1 through 5 characters, which is the stated range', () => {
    expect(parseReportSymbol('F: Ford something')).toBe('F')
    expect(parseReportSymbol('GOOGL: Alphabet something')).toBe('GOOGL')
  })

  it('trims surrounding whitespace', () => {
    expect(parseReportSymbol('  MSS : China')).toBe('MSS')
  })

  it('requires the ticker to already be upper-case in the source', () => {
    // Seen live on 10/18: a newsletter called "Za" was being tagged as the real
    // ticker ZA on a weekly market report. His bots write tickers in caps, humans
    // write mixed case, and a misattributed alert is worse than a placeholder.
    expect(parseReportSymbol('Za: Weekly Market Report 10/18/26')).toBeNull()
    expect(parseReportSymbol('mss: China')).toBeNull()
    expect(parseReportSymbol('CTSO: Why It Is Moving')).toBe('CTSO')
  })
})

describe('parseReportSymbol — refuses anything not ticker-shaped', () => {
  it('rejects a prefix longer than five characters', () => {
    // "Breaking" is a word, not a symbol. Tagging an alert BREAKI would be worse
    // than leaving it on the placeholder.
    expect(parseReportSymbol('Breaking: Fed holds rates')).toBeNull()
  })

  it('does not trip over the colon in a URL scheme', () => {
    expect(parseReportSymbol('https://example.com/report')).toBeNull()
  })

  it('rejects a purely numeric prefix — a time or a list marker, not a ticker', () => {
    expect(parseReportSymbol('2026: outlook')).toBeNull()
    expect(parseReportSymbol('10: things to watch')).toBeNull()
  })

  it('returns null when there is no colon at all', () => {
    expect(parseReportSymbol('Just a headline with no symbol')).toBeNull()
  })

  it('returns null for an empty prefix', () => {
    expect(parseReportSymbol(': leading colon')).toBeNull()
  })

  it('handles empty and missing input', () => {
    expect(parseReportSymbol('')).toBeNull()
    expect(parseReportSymbol(null)).toBeNull()
    expect(parseReportSymbol(undefined)).toBeNull()
  })
})

describe('resolveReportSymbol — falls back rather than guessing', () => {
  it('uses the parsed ticker when the title has one', () => {
    expect(resolveReportSymbol('MSS: China', 'SUB')).toBe('MSS')
  })

  it('keeps the view placeholder when the title has no ticker', () => {
    // This is the pre-existing behaviour for ordinary Substack/YouTube posts,
    // and it must survive: those genuinely have no symbol.
    expect(resolveReportSymbol('Why I am bullish on small caps', 'SUB')).toBe('SUB')
    expect(resolveReportSymbol('Breaking: Fed holds rates', 'NEWS')).toBe('NEWS')
  })
})

describe('isTradeableSymbol — who gets the price-alert boxes', () => {
  it('accepts ordinary tickers', () => {
    expect(isTradeableSymbol('AAPL')).toBe(true)
    expect(isTradeableSymbol('F')).toBe(true)
    expect(isTradeableSymbol('BRK-A')).toBe(true)
  })

  it('accepts the futures and crypto shapes the TV parser allows', () => {
    expect(isTradeableSymbol('ES1!')).toBe(true)
    expect(isTradeableSymbol('BTCUSD')).toBe(true)
  })

  it('rejects the Airtable placeholders — Justin: "ignore Substack and YouTube"', () => {
    expect(isTradeableSymbol('SUB')).toBe(false)
    expect(isTradeableSymbol('YT')).toBe(false)
    expect(isTradeableSymbol('NEWS')).toBe(false)
  })

  it('a Substack row that resolved to a real ticker DOES qualify', () => {
    // "MSS: China" has already become MSS by the time this is called, so the
    // report gets price-alert boxes even though its source view is Substack.
    expect(isTradeableSymbol(parseReportSymbol('MSS: China'))).toBe(true)
  })

  it('rejects empty and missing', () => {
    expect(isTradeableSymbol('')).toBe(false)
    expect(isTradeableSymbol(null)).toBe(false)
    expect(isTradeableSymbol(undefined)).toBe(false)
  })
})

describe('the real Airtable row shape — creator holds the ticker', () => {
  // The bug Justin reported after the first attempt shipped: symbols still came
  // through as SUB. The parser was fine; it was fed the wrong field.
  //
  // His rows are creator="MSS", title="China", and TC composes "MSS: China".
  // Parsing `title` alone only ever sees "China" — no colon, so every row fell
  // back to the placeholder. These pin the composed string as the input.
  const compose = (creator: string, title: string) => (creator ? `${creator}: ${title}` : title)

  it('pulls the ticker out of the composed message', () => {
    expect(resolveReportSymbol(compose('MSS', 'China'), 'SUB')).toBe('MSS')
    expect(resolveReportSymbol(compose('NWGL', 'Bagholder Levels'), 'SUB')).toBe('NWGL')
  })

  it('parsing the title alone would NOT have worked — this is the regression', () => {
    expect(resolveReportSymbol('China', 'SUB')).toBe('SUB')
    expect(resolveReportSymbol('Bagholder Levels', 'SUB')).toBe('SUB')
  })

  it('real non-ticker creators still fall back, as they should', () => {
    // Straight from the live base — these are newsletters and publications, and
    // tagging them with a ticker would be worse than the placeholder.
    expect(resolveReportSymbol(compose('Rise and Shine', 'Saturday, October 17, 2026'), 'SUB')).toBe('SUB')
    expect(resolveReportSymbol(compose("Investor's Business Daily", 'TJX Eyes Key Level'), 'NEWS')).toBe('NEWS')
    expect(resolveReportSymbol(compose('Summary', 'Clayton Morris - chlorine dioxide'), 'SUB')).toBe('SUB')
    expect(resolveReportSymbol(compose('After Close Momentum', 'Friday, October 16, 2026'), 'SUB')).toBe('SUB')
  })

  it('a row with no creator falls back rather than mis-parsing the title', () => {
    expect(resolveReportSymbol(compose('', 'One-Of-A-Kind LNG Stock Eyes Buy Point'), 'NEWS')).toBe('NEWS')
  })
})
