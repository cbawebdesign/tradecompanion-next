/**
 * Decides whether a URL can be shown inside TC's popup, and rewrites the ones
 * that have an embeddable equivalent.
 *
 * Framing is controlled by the TARGET site via X-Frame-Options and CSP
 * frame-ancestors. Nothing on our side can override either in a browser, so the
 * honest options are: frame it, rewrite it to something framable, or say up
 * front that it has to open in a tab. Guessing wrong costs Justin a blank white
 * box with no explanation, which reads as TC being broken.
 *
 * The blocklist below is measured, not assumed — checked with curl against the
 * live hosts on 2026-10-19:
 *
 *   x.com                 x-frame-options: SAMEORIGIN + frame-ancestors 'self'
 *   substack.com          frame-ancestors 'self' https://*.substack.com
 *   prnewswire.com        x-frame-options: SAMEORIGIN
 *   accesswire.com        x-frame-options: SAMEORIGIN
 *   youtube.com/watch     x-frame-options: SAMEORIGIN
 *   youtube.com/embed     no framing headers  -> so /watch is rewritten
 *   research.tradecompanion.com   no framing headers  -> the Airtable reports frame fine
 *
 * sec.gov, globenewswire and businesswire edge-block CLI requests, so their
 * headers could not be measured the same way; they are left to try the iframe
 * and fall back at runtime if they turn out to refuse.
 */

/** Hosts known to refuse framing. Matched on the host and its subdomains. */
const NEVER_FRAMES = [
  'x.com',
  'twitter.com',
  't.co',
  'substack.com',
  'prnewswire.com',
  'accesswire.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
]

export interface EmbedPlan {
  /** What to put in the iframe src, or null when it must open in a tab. */
  src: string | null
  /** Shown in the fallback panel when src is null. */
  reason?: string
}

function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith('.' + base)
}

const YOUTUBE_HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']

/**
 * YouTube watch/shorts/youtu.be links -> the embed player, which does frame.
 *
 * Returns null for a YouTube URL with no extractable video id. That case must
 * NOT fall through to "frame it anyway": every YouTube path except /embed/
 * sends x-frame-options: SAMEORIGIN, so framing it gives a blank panel. The
 * caller treats a YouTube host with no embed as refused.
 */
function youtubeEmbed(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null
  }

  if (u.pathname.startsWith('/embed/')) return u.toString()

  if (u.pathname === '/watch') {
    const id = u.searchParams.get('v')
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null
  }

  const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/)
  if (shorts) return `https://www.youtube.com/embed/${encodeURIComponent(shorts[1])}`

  return null
}

export function planEmbed(raw: string | null | undefined): EmbedPlan {
  if (!raw) return { src: null, reason: 'No link on this alert.' }

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { src: null, reason: 'That link is not a valid URL.' }
  }

  // Anything that is not plain web traffic never goes in an iframe.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { src: null, reason: 'Only web links can open inside TC.' }
  }

  const host = u.hostname.replace(/^www\./, '')

  if (YOUTUBE_HOSTS.some((h) => hostMatches(host, h))) {
    const yt = youtubeEmbed(u)
    return yt
      ? { src: yt }
      : { src: null, reason: 'Only YouTube video pages can play inside TC.' }
  }

  const blocked = NEVER_FRAMES.find((b) => hostMatches(host, b))
  if (blocked) {
    return { src: null, reason: `${blocked} does not allow its pages to be displayed inside another app.` }
  }

  return { src: u.toString() }
}
