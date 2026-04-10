/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Proxy for tradecompanion3-test (dev/test backend)
      {
        source: '/tc3-test/:path*',
        destination: 'https://tradecompanion3-test.azurewebsites.net/:path*',
      },
      // Proxy for tradecompanion3 (production backend)
      {
        source: '/tc3/:path*',
        destination: 'https://tradecompanion3.azurewebsites.net/:path*',
      },
      // Proxy for Grok API
      {
        source: '/tc-grok/:path*',
        destination: 'https://tradecompanion-grok.azurewebsites.net/:path*',
      },
      // Proxy for stage.scanzzers.com (machine-login JWT exchange)
      {
        source: '/scanzzers/:path*',
        destination: 'https://stage.scanzzers.com/:path*',
      },
    ]
  },
}

module.exports = nextConfig
