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

export function proxyUrl(url: string): string {
  if (!isLocalhost) return url
  for (const [origin, proxy] of Object.entries(PROXY_MAP)) {
    if (url.startsWith(origin)) {
      return url.replace(origin, proxy)
    }
  }
  return url
}
