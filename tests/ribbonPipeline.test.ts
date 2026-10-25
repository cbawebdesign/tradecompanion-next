import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Alert } from '../types'
import { mapReportAlerts } from '../lib/reportAlerts'
import { shouldBlacklistAlert } from '../lib/excludePrPatterns'
import { normalizeAlertMessage } from '../lib/alertDedup'

/**
 * End-to-end over the data ribbon's news pane, against a REAL recorded
 * response.
 *
 * Unit-testing the mapper only proves the mapper. Justin's DAVI report was
 * lost somewhere between a correct server response and an empty pane, so the
 * thing worth testing is the whole path: the actual payload the API returns,
 * through the actual mapper, through the actual filter chain the component
 * applies before render.
 *
 * tests/fixtures/alertsBySymbol-DAVI.json is the live response, recorded
 * 2026-10-25, for the exact symbol he reported.
 */
const payload = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'alertsBySymbol-DAVI.json'), 'utf8'),
)

/** The filter chain Watchlist/AlertsPage run between mapping and render. */
function ribbonPipeline(data: any, symbol: string, excludePrPatterns = ''): Alert[] {
  const mapped: Alert[] = []
  data.catalysts?.forEach((c: any) =>
    mapped.push({
      id: `db-cat-${c.time}`, symbol, message: c.text, type: 'catalyst',
      color: '', timestamp: new Date(c.time), read: false,
    } as Alert))
  mapped.push(...mapReportAlerts(data.reports, symbol))

  const merged = mapped
    .filter((a) => !shouldBlacklistAlert(a.type, a.message, excludePrPatterns))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const nonCatalyst = new Set(
    merged.filter((a) => a.type !== 'catalyst').map((a) => normalizeAlertMessage(a.message)))
  const seen = new Set<string>()
  return merged
    .filter((a) => a.type !== 'catalyst' || !nonCatalyst.has(normalizeAlertMessage(a.message)))
    .filter((a) => {
      const k = `${a.symbol}|${normalizeAlertMessage(a.message)}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

describe('DAVI reaches the news pane', () => {
  it('the recorded response really does contain the IPO Report', () => {
    // If this ever fails the fixture is stale, not the code.
    expect(payload.reports).toHaveLength(1)
    expect(payload.reports[0].source).toBe('IPO Reports')
  })

  it('survives the whole pipeline, not just the mapper', () => {
    const out = ribbonPipeline(payload, 'DAVI')
    const report = out.find((a) => a.message.includes('IPO Report'))
    expect(report, 'IPO Report was dropped between the API and render').toBeDefined()
    expect(report!.symbol).toBe('DAVI')
    expect(report!.url).toBe('https://research.tradecompanion.com/davi-ipo-i8ojhe4s/')
  })

  it('is not dropped by the ambulance-chaser blacklist', () => {
    // 'rss' is outside BLACKLISTABLE_TYPES; this pins that, because adding
    // 'rss' to that set later would silently empty the pane again.
    const out = ribbonPipeline(payload, 'DAVI', 'securities fraud|class action|investigation')
    expect(out.some((a) => a.message.includes('IPO Report'))).toBe(true)
  })

  it('would have produced an empty pane before the fix', () => {
    // Exactly the screenshot he sent: the old mapper ignored `reports`.
    const withoutReports = ribbonPipeline({ ...payload, reports: undefined }, 'DAVI')
    expect(withoutReports).toHaveLength(0)
  })
})
