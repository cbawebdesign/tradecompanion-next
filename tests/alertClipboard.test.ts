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
  it('uses the webhook JSON title rather than "SYMBOL — type"', () => {
    // His report: the popup header read "SUB — tradingview" instead of what he sent.
    expect(popupTitleForAlert({ symbol: 'SUB', type: 'tradingview', message: 'China Report' }))
      .toBe('China Report')
  })

  it('falls back to symbol and type when there is no message', () => {
    expect(popupTitleForAlert({ symbol: 'AAPL', type: 'filing', message: '' }))
      .toBe('AAPL — filing')
  })

  it('truncates a long headline so the close button stays reachable', () => {
    const long = 'x'.repeat(200)
    const out = popupTitleForAlert({ symbol: 'A', type: 'catalyst', message: long })
    expect(out.length).toBeLessThanOrEqual(110)
    expect(out.endsWith('…')).toBe(true)
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
