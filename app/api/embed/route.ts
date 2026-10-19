import { NextRequest, NextResponse } from 'next/server'
import { isProxyableHost } from '@/lib/embeddableUrl'
import { injectBase } from '@/lib/injectBase'

/**
 * Serves an allowlisted page through TC's own origin so the popup can control
 * how links inside it behave.
 *
 * Justin: "once a pop up is up, if a user clicks a URL in the pop up, please
 * open that URL in a new browser window."
 *
 * A cross-origin iframe cannot be reached from the parent page — no click
 * handler, no link rewriting, nothing. The only way to change what a link
 * inside the frame does is to be the one serving the document, which is what
 * this route is for: it fetches the page server-side and injects
 *
 *     <base href="<original url>" target="_blank">
 *
 * The href keeps relative links, images and stylesheets resolving against the
 * real site; the target sends every link that does not set its own target into
 * a new browser window instead of replacing the report inside the popup.
 *
 * SCOPE IS DELIBERATELY NARROW. This is an allowlist, not a general web proxy —
 * an endpoint that fetches arbitrary user-supplied URLs server-side is an SSRF
 * hole, and TC's endpoints are already mostly anonymous. isProxyableHost holds
 * the list; today that is the research domain the Airtable reports live on,
 * which is self-contained static HTML and proxies cleanly.
 */

const MAX_BYTES = 4 * 1024 * 1024

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url')
  if (!raw) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'url is not valid' }, { status: 400 })
  }

  if (target.protocol !== 'https:') {
    return NextResponse.json({ error: 'only https is proxied' }, { status: 400 })
  }

  if (!isProxyableHost(target.hostname)) {
    return NextResponse.json({ error: 'host is not on the embed allowlist' }, { status: 403 })
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // Declared rather than spoofed. SEC's fair-access policy asks
        // automated traffic to identify itself, and a filing fetches fine
        // with this — checked against both a filing and an index page.
        'User-Agent': 'TradeCompanion/2.8.31 (+https://tradecompanion.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      // Nothing of ours should ride along with the request.
      cache: 'no-store',
      redirect: 'follow',
    })

    // Every failure below hands the browser the original URL instead of an
    // error. The iframe then follows the redirect and frames the site directly,
    // which is exactly the behaviour we had before this route existed — so the
    // proxy can only ever improve a page, never break one.
    if (!upstream.ok) {
      return NextResponse.redirect(target.toString(), 302)
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      // Not a document we can rewrite — send the caller to the real thing
      // rather than streaming something unexpected back through our origin.
      return NextResponse.redirect(target.toString(), 302)
    }

    const html = await upstream.text()
    if (html.length > MAX_BYTES) {
      return NextResponse.redirect(target.toString(), 302)
    }

    return new NextResponse(injectBase(html, target.toString()), {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Only TC may frame this. Without it we would be handing anyone a way
        // to frame third-party HTML under our origin.
        'Content-Security-Policy': "frame-ancestors 'self'",
        'Cache-Control': 'private, max-age=60',
        'X-Robots-Tag': 'noindex',
      },
    })
  } catch {
    // Same degradation as above: fall back to the real site rather than
    // putting an error document inside Justin's popup.
    return NextResponse.redirect(target.toString(), 302)
  }
}
