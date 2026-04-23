const { execSync } = require('child_process')

// Build marker — surfaces in Settings so users can tell us exactly which
// bundle their browser is running. Resolved once at build time.
const buildSha = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
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
