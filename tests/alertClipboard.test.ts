import { describe, it, expect } from 'vitest'
import { clipboardTextForAlert, popupTitleForAlert, isTradeCompanionHost } from '../lib/alertClipboard'

describe('clipboardTextForAlert', () => {
  it('copies the URL for SEC filings, not the boilerplate title', () => {
    expect(clipboardTextForAlert({
      type: 'filing',
      message: '8-K - EVERNORTH HOLDINGS INC (0002092592) (Filer)',
      url: 'https://www.sec.gov/Archives/edgar/data/1/x.htm',
    })).toBe('https://www.sec.gov/Archives/edgar/data/1/x.htm')
  })

  it('falls back to the title when a filing has no url', () => {
    expect(clipboardTextForAlert({ type: 'filing', message: '8-K - SOMETHING' }))
      .toBe('8-K - SOMETHING')
  })

  it('copies the headline for every other type', () => {
    expect(clipboardTextForAlert({ type: 'catalyst', message: 'Company announces thing', url: 'https://x.test' }))
      .toBe('Company announces thing')
  })

  it('strips the Catalyst PR source prefix', () => {
    expect(clipboardTextForAlert({ type: 'catalyst', message: 'Catalyst PR Big news today' }))
      .toBe('Big news today')
  })
})

describe('popupTitleForAlert', () => {
  it('is SYMBOL — JSON title, not SYMBOL — type', () => {
    // His report: the popup header read "SUB — tradingview". He asked for the
    // symbol kept and the type replaced with the title he actually sent.
    expect(popupTitleForAlert({ symbol: 'SUB', type: 'tradingview', message: 'China Report' }))
      .toBe('SUB — China Report')
  })

  it('does not repeat a symbol the title already leads with', () => {
    // His bots post "AHTPI - Dilution Report"; prefixing would double it.
    for (const msg of ['AHTPI - Dilution Report', 'AHTPI: Dilution Report',
                       'AHTPI — Dilution Report', '$AHTPI Dilution Report']) {
      expect(popupTitleForAlert({ symbol: 'AHTPI', type: 'tradingview', message: msg })).toBe(msg)
    }
  })

  it('does not treat a longer ticker as a match for a shorter one', () => {
    // "AHTPI …" must not count as already leading with "AH".
    expect(popupTitleForAlert({ symbol: 'AH', type: 'tradingview', message: 'AHTPI runs' }))
      .toBe('AH — AHTPI runs')
  })

  it('falls back to symbol and type when there is no message', () => {
    expect(popupTitleForAlert({ symbol: 'AAPL', type: 'filing', message: '' }))
      .toBe('AAPL — filing')
  })

  it('never dangles a separator when the alert carries no symbol', () => {
    expect(popupTitleForAlert({ symbol: '', type: 'tradingview', message: 'Market open' }))
      .toBe('Market open')
    expect(popupTitleForAlert({ symbol: '', type: 'tradingview', message: '' }))
      .toBe('tradingview')
  })

  it('truncates a long headline so the close button stays reachable', () => {
    const long = 'x'.repeat(200)
    const out = popupTitleForAlert({ symbol: 'A', type: 'catalyst', message: long })
    expect(out.length).toBeLessThanOrEqual(110)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps the symbol visible even when the title is far too long', () => {
    // Truncating the combined string, not the title first, is what guarantees this.
    const out = popupTitleForAlert({ symbol: 'NVDA', type: 'catalyst', message: 'y'.repeat(300) })
    expect(out.startsWith('NVDA — ')).toBe(true)
  })
})

describe('isTradeCompanionHost', () => {
  it.each([
    'https://research.tradecompanion.com/x-china-abc/',
    'https://reports.tradecompanion.com/y',   // the new subdomain he added
    'https://tradecompanion.com/z',
  ])('matches %s', (u) => expect(isTradeCompanionHost(u)).toBe(true))

  it.each([
    'https://www.sec.gov/Archives/x.htm',
    'https://www.espn.com/',
    'https://nottradecompanion.com/x',        // must not match on suffix alone
    'not a url',
  ])('does not match %s', (u) => expect(isTradeCompanionHost(u)).toBe(false))
})
