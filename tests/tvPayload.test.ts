import { describe, it, expect } from 'vitest'
import { parseTvPayload, isTvSymbol } from '../lib/tvPayload'

/**
 * Justin's bot posts {"symbol","title","url"} to his personal webhook. The
 * worker parses the symbol and broadcasts the body verbatim; the client only
 * ever unwrapped raw_text|text|message|alert, so `title` fell through and the
 * row rendered as the literal JSON string with nothing clickable.
 *
 * His two live test payloads are pinned below exactly as he sent them.
 */
describe('parseTvPayload', () => {
  describe("Justin's live payloads", () => {
    it('renders a title-only body as text with a working link', () => {
      const p = parseTvPayload('{"symbol":"AAPL","title":"Report","url":"https://www.espn.com/"}')
      expect(p.text).toBe('Report')
      expect(p.url).toBe('https://www.espn.com/')
      expect(p.symbol).toBe('AAPL')
    })

    it('still prefers message when both are present', () => {
      // This is the payload that appeared to work before the fix.
      const p = parseTvPayload('{"symbol":"AAPL","title":"Report","url":"https://www.espn.com/","message":"Report"}')
      expect(p.text).toBe('Report')
      expect(p.url).toBe('https://www.espn.com/')
    })
  })

  describe('plain text is untouched', () => {
    it.each([
      'SPCX Crossing 5.97',
      'ES1! crossed above 5000',
      '$BTCUSD long signal',
      'no ticker here at all',
    ])('passes through %s unchanged with no url', (txt) => {
      const p = parseTvPayload(txt)
      expect(p.text).toBe(txt)
      expect(p.url).toBeUndefined()
      expect(p.symbol).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('shows malformed JSON rather than swallowing it', () => {
      const bad = '{"symbol":"AAPL", broken'
      expect(parseTvPayload(bad).text).toBe(bad)
    })

    it('falls back to the raw body when no text key is recognised', () => {
      const body = '{"foo":"bar"}'
      expect(parseTvPayload(body).text).toBe(body)
    })

    it('accepts link as an alias for url, and ticker for symbol', () => {
      const p = parseTvPayload('{"ticker":"tsla","title":"X","link":"https://e.test"}')
      expect(p.url).toBe('https://e.test')
      expect(p.symbol).toBe('TSLA')
    })

    it('rejects a non-ticker symbol value rather than showing junk', () => {
      expect(parseTvPayload('{"symbol":"NOT A TICKER","title":"X"}').symbol).toBeUndefined()
    })

    it('handles empty and non-string input', () => {
      expect(parseTvPayload('').text).toBe('')
      expect(parseTvPayload(null).text).toBe('')
      expect(parseTvPayload(undefined).text).toBe('')
    })
  })

  describe('isTvSymbol', () => {
    it('accepts the shapes TradingView actually sends', () => {
      for (const s of ['AAPL', 'TSLA', 'BTCUSD', 'SOLUSDT', 'ES1!', 'CL1!']) {
        expect(isTvSymbol(s)).toBe(true)
      }
    })
    it('rejects prose', () => {
      for (const s of ['REPORT', 'CROSSING', 'THISISLONG']) {
        expect(isTvSymbol(s)).toBe(false)
      }
    })
  })
})

describe('url scheme validation', () => {
  // Alert.url is rendered as a bare <a href> in the popup's fallback panel,
  // and the webhook route is anonymous — anyone with the key posts the body.
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'not a url at all',
  ])('drops a non-http(s) url: %s', (bad) => {
    const p = parseTvPayload(JSON.stringify({ symbol: 'AAPL', title: 'X', url: bad }))
    expect(p.url).toBeUndefined()
    expect(p.text).toBe('X')   // the alert still renders, just not clickable
  })

  it.each(['https://www.espn.com/', 'http://example.test/a?b=c'])('keeps %s', (good) => {
    expect(parseTvPayload(JSON.stringify({ title: 'X', url: good })).url).toBe(good)
  })
})
