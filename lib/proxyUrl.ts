// Rewrites Azure URLs to local proxy paths when running on localhost
// This avoids CORS issues during local development
// The Next.js rewrites in next.config.js handle the actual proxying

const PROXY_MAP: Record<string, string> = {
  'https://tradecompanion3-test.azurewebsites.net': '/tc3-test',
  'https://tradecompanion3.azurewebsites.net': '/tc3',
  'https://tradecompanion-grok.azurewebsites.net': '/tc-grok',
  'https://stage.scanzzers.com': '/scanzzers',
}

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

// Hosts that must go through the rewrite in PRODUCTION too, not just locally.
//
// stage.scanzzers.com serves no Access-Control-Allow-Origin, so the browser
// blocks the machine-login call outright and NewsHub never gets a JWT — it has
// been logging "Auth failed" on every load and delivering zero news. The Azure
// hosts are deliberately NOT in here: they allow * and are faster called
// directly, and routing every worker request through Vercel would add a hop to
// the whole app.
//
// Only the auth host needs this. stage.news.scanzzers.com, which the SignalR
// hub itself lives on, does echo the origin back and connects fine once the
// JWT exists.
const ALWAYS_PROXY = ['https://stage.scanzzers.com']

export function proxyUrl(url: string): string {
  for (const origin of ALWAYS_PROXY) {
    if (url.startsWith(origin)) return url.replace(origin, PROXY_MAP[origin])
  }
  if (!isLocalhost) return url
  for (const [origin, proxy] of Object.entries(PROXY_MAP)) {
    if (url.startsWith(origin)) {
      return url.replace(origin, proxy)
    }
  }
  return url
}
