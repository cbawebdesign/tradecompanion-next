import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseBridgeMessage,
  normalizeBridgeSymbol,
  isPrivilegedBridgeRequest,
  isMutatingBridgeRequest,
  isRealSymbol,
} from '../lib/popupBridge'

describe('normalizeBridgeSymbol', () => {
  it('accepts the shapes his pages will send', () => {
    expect(normalizeBridgeSymbol(' ahtpi ')).toBe('AHTPI')
    expect(normalizeBridgeSymbol('$AAPL')).toBe('AAPL')
    expect(normalizeBridgeSymbol('BRK.B')).toBe('BRK.B')
    expect(normalizeBridgeSymbol('BTCUSD')).toBe('BTCUSD')
    expect(normalizeBridgeSymbol('ES1!')).toBe('ES1!')
  })

  it('rejects source tags that are not tickers', () => {
    // These add rows to watchlists; a "RSS" row is the bug this prevents.
    for (const s of ['RSS', 'MAIL', 'YT', 'SUB', 'NEWS', 'N/A', '']) {
      expect(normalizeBridgeSymbol(s)).toBeNull()
    }
  })

  it('rejects anything not shaped like a ticker', () => {
    for (const s of ['<script>', 'a b', 'WAYTOOLONGSYMBOL', '1AAPL', '../../etc', null, 42, {}]) {
      expect(normalizeBridgeSymbol(s as unknown)).toBeNull()
    }
  })
})

describe('parseBridgeMessage', () => {
  it('ignores the noise every window receives', () => {
    // React DevTools, Next HMR and anything else on the page post here too.
    for (const d of [null, undefined, 'string', 42, {}, { type: 'webpackHotUpdate' }]) {
      expect(parseBridgeMessage(d as unknown)).toBeNull()
    }
  })

  it('keeps tc-open-url as narrow as it was', () => {
    expect(parseBridgeMessage({ type: 'tc-open-url', url: 'https://sec.gov/x' }))
      .toEqual({ type: 'tc-open-url', url: 'https://sec.gov/x' })
    // This is the one verb an untrusted frame can reach, so the scheme check
    // is the whole defence.
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '/relative']) {
      expect(parseBridgeMessage({ type: 'tc-open-url', url })).toBeNull()
    }
  })

  it('parses the symbol verbs', () => {
    expect(parseBridgeMessage({ type: 'tc-symbol-click', symbol: 'aapl' }))
      .toEqual({ type: 'tc-symbol-click', symbol: 'AAPL' })
    expect(parseBridgeMessage({ type: 'tc-query', symbol: 'AAPL' }))
      .toEqual({ type: 'tc-query', symbol: 'AAPL' })
  })

  it('treats a missing `on` as toggle and a boolean as explicit', () => {
    expect(parseBridgeMessage({ type: 'tc-flag', symbol: 'AAPL' }))
      .toEqual({ type: 'tc-flag', symbol: 'AAPL' })
    expect(parseBridgeMessage({ type: 'tc-flag', symbol: 'AAPL', on: false }))
      .toEqual({ type: 'tc-flag', symbol: 'AAPL', on: false })
    // A non-boolean must not be coerced into "set it off".
    expect(parseBridgeMessage({ type: 'tc-flag', symbol: 'AAPL', on: 'yes' }))
      .toEqual({ type: 'tc-flag', symbol: 'AAPL' })
  })

  it('carries a named watchlist, and drops an implausible one', () => {
    expect(parseBridgeMessage({ type: 'tc-watchlist-add', symbol: 'AAPL', watchlist: ' Movers ' }))
      .toEqual({ type: 'tc-watchlist-add', symbol: 'AAPL', watchlist: 'Movers' })
    expect(parseBridgeMessage({ type: 'tc-watchlist-add', symbol: 'AAPL', watchlist: 'x'.repeat(200) }))
      .toEqual({ type: 'tc-watchlist-add', symbol: 'AAPL' })
    expect(parseBridgeMessage({ type: 'tc-watchlist-add', symbol: 'AAPL', watchlist: '   ' }))
      .toEqual({ type: 'tc-watchlist-add', symbol: 'AAPL' })
  })

  it('rejects a verb whose symbol is junk rather than acting on a default', () => {
    expect(parseBridgeMessage({ type: 'tc-flag', symbol: 'RSS' })).toBeNull()
    expect(parseBridgeMessage({ type: 'tc-watchlist-add' })).toBeNull()
  })
})

describe('privilege classification', () => {
  it('everything except tc-open-url needs a trusted origin', () => {
    // tc-symbol-click fires an HTTP request at the user's local AHK server and
    // tc-query discloses watchlist names, so neither is "read-only enough".
    const privileged = [
      { type: 'tc-symbol-click', symbol: 'AAPL' },
      { type: 'tc-flag', symbol: 'AAPL' },
      { type: 'tc-watchlist-add', symbol: 'AAPL' },
      { type: 'tc-query', symbol: 'AAPL' },
    ] as const
    for (const r of privileged) expect(isPrivilegedBridgeRequest(r)).toBe(true)
    expect(isPrivilegedBridgeRequest({ type: 'tc-open-url', url: 'https://x.com' })).toBe(false)
  })

  it('only flag and watchlist writes to the store', () => {
    expect(isMutatingBridgeRequest({ type: 'tc-flag', symbol: 'A' })).toBe(true)
    expect(isMutatingBridgeRequest({ type: 'tc-watchlist-add', symbol: 'A' })).toBe(true)
    expect(isMutatingBridgeRequest({ type: 'tc-query', symbol: 'A' })).toBe(false)
  })
})

describe('isRealSymbol is shared, not copied', () => {
  it('AlertBar imports it rather than redefining it', () => {
    // It was defined in both places; a flag arriving from an embedded page has
    // to be refused for exactly the rows the timeline refuses.
    const src = readFileSync(join(__dirname, '..', 'components', 'AlertBar.tsx'), 'utf8')
    expect(src).toContain("import { isRealSymbol } from '@/lib/popupBridge'")
    expect(src).not.toMatch(/const isRealSymbol\s*=/)
  })

  it('still classifies the way AlertBar did', () => {
    expect(isRealSymbol('AAPL')).toBe(true)
    expect(isRealSymbol('rss')).toBe(false)
    expect(isRealSymbol(null)).toBe(false)
  })
})

describe('ReportPopup enforces both halves of the gate', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'ReportPopup.tsx'), 'utf8')

  it('checks the sender is this popup frame AND a tradecompanion origin', () => {
    // Either check alone is insufficient: origin alone would accept a message
    // from another window that happens to be on the domain, and source alone
    // would accept anything the popup currently frames.
    expect(src).toContain('e.source !== frameWindow')
    expect(src).toContain('isTradeCompanionHost(e.origin)')
    expect(src).toContain('isPrivilegedBridgeRequest(req)')
  })

  it('replies to the frame origin, never to a wildcard', () => {
    // The reply carries his watchlist names.
    expect(src).toContain('postMessage(state, e.origin)')
    expect(src).not.toContain("postMessage(state, '*')")
  })
})
