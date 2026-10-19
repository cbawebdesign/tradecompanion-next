import { describe, it, expect } from 'vitest'
import { planEmbed } from '../lib/embeddableUrl'

/**
 * Pins the framing decisions behind the in-app popup. The blocklist here is
 * measured against the live hosts, not assumed — see the comment at the top of
 * lib/embeddableUrl.ts. If one of these sites ever starts allowing framing,
 * the right move is to re-measure and delete the entry, which will fail the
 * matching test here and force the decision to be explicit.
 */
describe('planEmbed', () => {
  describe('frames normally', () => {
    it('frames the Airtable report domain', () => {
      const url = 'https://research.tradecompanion.com/ctso-china-sxg1xb81/'
      expect(planEmbed(url).src).toBe(url)
    })

    it('frames SEC filing archives', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/913760/000166221026000018/x.htm'
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
