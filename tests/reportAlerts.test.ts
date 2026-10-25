import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mapReportAlerts } from '../lib/reportAlerts'

const row = (over = {}) => ({
  time: '2026-10-23T15:49:22',
  text: 'IPO Report',
  source: 'IPO Reports',
  symbol: 'DAVI',
  url: 'https://reports.tradecompanion.com/x',
  ...over,
})

describe('mapReportAlerts', () => {
  it('renders the DAVI IPO Report the server was already returning', () => {
    const [a] = mapReportAlerts([row()], 'DAVI')
    expect(a.symbol).toBe('DAVI')
    expect(a.message).toBe('DAVI: IPO Report')
    expect(a.url).toBe('https://reports.tradecompanion.com/x')
  })

  it("types them 'rss', matching the live push", () => {
    // newAirtableReport uses 'rss' so they ride the ungated path; a report that
    // arrived live and the same one fetched back must render identically.
    expect(mapReportAlerts([row()], 'DAVI')[0].type).toBe('rss')
  })

  it('gives two bases holding the same symbol distinct ids', () => {
    const out = mapReportAlerts(
      [row({ source: 'IPO Reports' }), row({ source: 'Grok Reports' })], 'DAVI')
    expect(out).toHaveLength(2)
    expect(out[0].id).not.toBe(out[1].id)
  })

  it('drops a row with an unusable time rather than showing Invalid Date', () => {
    expect(mapReportAlerts([row({ time: 'nope' })], 'DAVI')).toHaveLength(0)
    expect(mapReportAlerts([row({ time: undefined })], 'DAVI')).toHaveLength(0)
  })

  it('still names the base when a row has no title', () => {
    expect(mapReportAlerts([row({ text: '' })], 'DAVI')[0].message).toBe('DAVI: IPO Reports')
  })

  it('handles the empty and missing cases', () => {
    expect(mapReportAlerts(undefined, 'DAVI')).toEqual([])
    expect(mapReportAlerts([], 'DAVI')).toEqual([])
  })
})

describe('every AlertsBySymbol call site reads reports', () => {
  // The server returned `reports` from the start and all three mappers ignored
  // it, so no Airtable base ever reached the ribbon. Adding a collection to
  // two of three is the same bug again.
  const files = ['Watchlist.tsx', 'AlertsPage.tsx']

  it('maps reports wherever it maps catalysts', () => {
    for (const f of files) {
      const src = readFileSync(join(__dirname, '..', 'components', f), 'utf8')
      const catalystSites = src.split('data.catalysts?.forEach').length - 1
      const reportSites = src.split('mapReportAlerts(data.reports').length - 1
      expect(reportSites, `${f}: ${catalystSites} catalyst mappers, ${reportSites} report mappers`)
        .toBe(catalystSites)
    }
  })
})
