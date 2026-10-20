import { describe, it, expect } from 'vitest'
import { planEmbed } from '../lib/embeddableUrl'
import { injectBase } from '../lib/injectBase'

/**
 * Pins the framing decisions behind the in-app popup. The blocklist here is
 * measured against the live hosts, not assumed — see the comment at the top of
 * lib/embeddableUrl.ts. If one of these sites ever starts allowing framing,
 * the right move is to re-measure and delete the entry, which will fail the
 * matching test here and force the decision to be explicit.
 */
describe('planEmbed', () => {
  describe('frames normally', () => {
    // The Airtable report domain frames fine on its own, but is deliberately
    // routed through /api/embed so links inside it can be forced to open in a
    // new browser window — see the "proxied hosts" block below.

    it('frames the Airtable report domain directly', () => {
      const url = 'https://research.tradecompanion.com/ctso-china-sxg1xb81/'
      expect(planEmbed(url).src).toBe(url)
    })

    it('frames an unknown host rather than pre-emptively blocking it', () => {
      expect(planEmbed('https://example-newswire.test/pr/1').src)
        .toBe('https://example-newswire.test/pr/1')
    })
  })

  describe('YouTube is rewritten to the embed player', () => {
    it('rewrites a watch link', () => {
      expect(planEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ').src)
        .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('keeps the id when the watch link carries extra params', () => {
      expect(planEmbed('https://www.youtube.com/watch?v=abc123&t=42s&list=PL1').src)
        .toBe('https://www.youtube.com/embed/abc123')
    })

    it('rewrites a youtu.be short link', () => {
      expect(planEmbed('https://youtu.be/dQw4w9WgXcQ').src)
        .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('rewrites a shorts link', () => {
      expect(planEmbed('https://www.youtube.com/shorts/xyz789').src)
        .toBe('https://www.youtube.com/embed/xyz789')
    })

    it('leaves an existing embed link alone', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      expect(planEmbed(url).src).toBe(url)
    })

    it('falls back when a watch link has no video id', () => {
      expect(planEmbed('https://www.youtube.com/watch').src).toBeNull()
    })
  })

  describe('hosts that refuse framing', () => {
    it.each([
      ['https://x.com/someone/status/1', 'x.com'],
      ['https://twitter.com/someone/status/1', 'twitter.com'],
      ['https://justin.substack.com/p/the-note', 'substack.com'],
      ['https://www.prnewswire.com/news-releases/thing.html', 'prnewswire.com'],
      ['https://www.accesswire.com/123/thing', 'accesswire.com'],
    ])('refuses %s', (url, host) => {
      const plan = planEmbed(url)
      expect(plan.src).toBeNull()
      expect(plan.reason).toContain(host)
    })

    it('matches subdomains, not just the bare host', () => {
      expect(planEmbed('https://mobile.twitter.com/x/status/1').src).toBeNull()
    })

    it('does not match a host that merely ends with the same letters', () => {
      // notx.com must not be caught by the x.com entry.
      expect(planEmbed('https://notx.com/page').src).toBe('https://notx.com/page')
    })
  })

  describe('rejects what should never reach an iframe', () => {
    it('rejects a javascript: URL', () => {
      expect(planEmbed('javascript:alert(1)').src).toBeNull()
    })

    it('rejects a data: URL', () => {
      expect(planEmbed('data:text/html,<h1>hi</h1>').src).toBeNull()
    })

    it('rejects a malformed URL', () => {
      expect(planEmbed('not a url').src).toBeNull()
    })

    it('rejects empty and null input', () => {
      expect(planEmbed('').src).toBeNull()
      expect(planEmbed(null).src).toBeNull()
      expect(planEmbed(undefined).src).toBeNull()
    })
  })
})

describe('proxied hosts', () => {
  // Measured: SEC pages carry many anchors and none set a target, so every
  // click would otherwise replace the popup.
  it('routes SEC filings through /api/embed', () => {
    const url = 'https://www.sec.gov/Archives/edgar/data/1/x.htm'
    const plan = planEmbed(url)
    expect(plan.proxied).toBe(true)
    expect(plan.src).toBe('/api/embed?url=' + encodeURIComponent(url))
  })

  it('proxies SEC subdomains too', () => {
    expect(planEmbed('https://efts.sec.gov/LATEST/search-index?q=x').proxied).toBe(true)
  })

  // Measured: all 151 anchors across 17 live reports already carry
  // target="_blank", so a proxy hop would buy nothing and only add latency to
  // the feature Justin uses most.
  it('does NOT proxy the report domain, which already targets _blank', () => {
    const url = 'https://research.tradecompanion.com/ctso-china-sxg1xb81/'
    const plan = planEmbed(url)
    expect(plan.proxied).toBeFalsy()
    expect(plan.src).toBe(url)
  })

  it('does not proxy a host that merely ends with the same letters', () => {
    expect(planEmbed('https://notsec.gov/x').proxied).toBeFalsy()
  })
})

describe('injectBase', () => {
  it('puts the base tag immediately after <head>, before any content', () => {
    const out = injectBase('<!DOCTYPE html><html><head><title>x</title></head><body>b</body></html>', 'https://e.test/a/b')
    expect(out).toContain('<head><base href="https://e.test/a/b" target="_blank">')
    // Must precede the first element that could resolve a relative URL.
    expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<title>'))
  })

  it('injects the click interceptor that hands URLs to TC', () => {
    // target="_blank" is denied inside a frame under Electron, so the popup
    // relies on this postMessage path to open links in a real browser window.
    const out = injectBase('<html><head></head></html>', 'https://e.test/p')
    expect(out).toContain("type:'tc-open-url'")
    expect(out).toContain('preventDefault')
    // Only real web links are forwarded.
    expect(out).toContain('/^https?:/i')
  })

  it('removes a base tag the document already had', () => {
    const out = injectBase('<html><head><base href="https://other.test/"><title>x</title></head></html>', 'https://e.test/p')
    expect(out).not.toContain('other.test')
    expect((out.match(/<base /g) || []).length).toBe(1)
  })

  it('creates a head when the document has none', () => {
    const out = injectBase('<html><body>hi</body></html>', 'https://e.test/p')
    expect(out).toContain('<head><base href="https://e.test/p" target="_blank">')
    expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<body>'))
  })

  it('still injects into a bare fragment', () => {
    const out = injectBase('<p>hi</p>', 'https://e.test/p')
    expect(out.startsWith('<base href="https://e.test/p" target="_blank">')).toBe(true)
  })

  it('escapes quotes and ampersands in the href', () => {
    const out = injectBase('<html><head></head></html>', 'https://e.test/p?a=1&b=2')
    expect(out).toContain('href="https://e.test/p?a=1&amp;b=2"')
  })

  it('matches HEAD in any case', () => {
    const out = injectBase('<HTML><HEAD></HEAD></HTML>', 'https://e.test/p')
    expect(out).toContain('<base href="https://e.test/p" target="_blank">')
    expect(out.indexOf('<base')).toBeGreaterThan(out.indexOf('<HEAD>'))
  })
})
