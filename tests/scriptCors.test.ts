import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/**
 * A throw inside a cross-origin script is reported to window.onerror as a bare
 * "Script error." with no filename, line or stack unless the script was loaded
 * with CORS. That is precisely the report that arrived from Safari on
 * 2026-10-21 — the first auto-captured error in two and a half months, and
 * undiagnosable as received.
 *
 * TradingView's CDN sends Access-Control-Allow-Origin: * (verified against the
 * live URLs), so every loader must set crossOrigin or the next one is just as
 * opaque.
 */
const FILES = [
  'components/TradingViewChart.tsx',
  'components/ChartsPage.tsx',
  'components/ChartPanel.tsx',
]

describe('cross-origin script loaders', () => {
  it.each(FILES)('%s sets crossOrigin on every injected script', (f) => {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    const creates = (src.match(/document\.createElement\('script'\)/g) || []).length
    const cors = (src.match(/script\.crossOrigin\s*=/g) || []).length
    expect(creates).toBeGreaterThan(0)
    expect(cors).toBe(creates)
  })

  it('every injected script points at a host known to allow CORS', () => {
    for (const f of FILES) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      const srcs = src.match(/script\.src\s*=\s*'[^']+'/g) || []
      for (const m0 of srcs) {
        const m = [m0, m0.replace(/^[^']*'/, '').replace(/'$/, '')]
        // Adding crossOrigin to a host that does NOT send ACAO would block the
        // load outright, so this pins the assumption rather than leaving it.
        expect(m[1]).toMatch(/^https:\/\/s3\.tradingview\.com\//)
      }
    }
  })
})
