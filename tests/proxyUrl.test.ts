import { describe, it, expect } from 'vitest'
import { proxyUrl } from '../lib/proxyUrl'

/**
 * stage.scanzzers.com sends no Access-Control-Allow-Origin, so the browser
 * blocks machine-login and NewsHub never authenticates. It has to go through
 * the Next rewrite in production, not only on localhost.
 */
describe('proxyUrl', () => {
  it('always rewrites the scanzzers auth host, even off localhost', () => {
    expect(proxyUrl('https://stage.scanzzers.com/auth/machine-login'))
      .toBe('/scanzzers/auth/machine-login')
  })

  it('leaves the news hub alone — it allows CORS and SignalR needs the real host', () => {
    const u = 'https://stage.news.scanzzers.com/newshub'
    expect(proxyUrl(u)).toBe(u)
  })

  it('leaves the Azure worker direct in production', () => {
    const u = 'https://tradecompanion3.azurewebsites.net/api/Quotes?symbols=AAPL'
    expect(proxyUrl(u)).toBe(u)
  })

  it('passes through an unrelated url', () => {
    expect(proxyUrl('https://example.test/x')).toBe('https://example.test/x')
  })
})
