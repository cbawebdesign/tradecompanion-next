import { describe, it, expect } from 'vitest'
import { buildRibbonAlerts } from '@/lib/ribbonAlerts'
import type { Alert } from '@/types'

/**
 * Justin ("Data Ribbon Touchup", 10/27). Cases are his screenshots: DAVI for
 * the Press Release Summaries duplicate and the 90-day bases, AZTR for the
 * TradingView repeats.
 */

const PREV_CLOSE = new Date('2026-10-28T20:00:00Z').getTime()
const today = (hms: string) => new Date(`2026-10-29T${hms}-04:00`)

let n = 0
function a(p: Partial<Alert> & Pick<Alert, 'type' | 'message' | 'timestamp'>): Alert {
  return { id: `a${n++}`, symbol: 'DAVI', color: '', read: false, ...p } as Alert
}
const build = (live: Alert[], db: Alert[] = []) =>
  buildRibbonAlerts(live, db, { sinceMs: PREV_CLOSE }).map(x => x.message)

describe('Press Release Summaries duplicate (DAVI)', () => {
  const headline = 'Davion acquires WoundSkan and Spektra IP for $25M ($2.5M cash + 1,730,770 shares @ $13 fixed)'
  const green = a({ type: 'catalyst', message: headline, timestamp: today('08:12:01') })
  const red = a({ type: 'rss', source: 'report:Press Release Summaries', message: `DAVI: ${headline}`, timestamp: today('08:12:02') })

  it('keeps the green Catalyst PR and drops the red report row', () => {
    expect(build([], [green, red])).toEqual([headline])
  })

  it('works the same when the report arrived live', () => {
    const liveRed = { ...red, source: 'useSignalR:newAirtableReport:Press Release Summaries' }
    expect(build([liveRed], [green])).toEqual([headline])
  })

  it('a report with no matching story still shows', () => {
    const ipo = a({ type: 'rss', source: 'report:IPO Reports', message: 'DAVI: IPO Report', timestamp: today('07:00:00') })
    expect(build([], [green, red, ipo])).toEqual([headline, 'DAVI: IPO Report'])
  })
})

describe('since previous close, except the two 90-day bases', () => {
  const old = new Date('2026-10-23T19:49:22Z')

  it('keeps an old IPO Report and an old Press Release Summary', () => {
    const ipo = a({ type: 'rss', source: 'report:IPO Reports', message: 'DAVI: IPO Report', timestamp: old })
    const prs = a({ type: 'rss', source: 'report:Press Release Summaries', message: 'DAVI: older summary', timestamp: old })
    expect(build([], [ipo, prs])).toEqual(['DAVI: IPO Report', 'DAVI: older summary'])
  })

  it('drops an old row from any other base, and anything else older than the close', () => {
    const grok = a({ type: 'rss', source: 'report:Grok Reports', message: 'DAVI: grok take', timestamp: old })
    const filing = a({ type: 'filing', message: '8-K old filing', timestamp: old })
    const fresh = a({ type: 'filing', message: '8-K today', timestamp: today('07:30:00') })
    expect(build([], [grok, filing, fresh])).toEqual(['8-K today'])
  })
})

describe('TradingView repeats (AZTR)', () => {
  const tv = (msg: string, hms: string, ms = 0) =>
    a({ symbol: 'AZTR', type: 'tradingview', message: msg, timestamp: new Date(today(hms).getTime() + ms) })

  it('shows every trigger of the same TradingView alert', () => {
    const rows = [tv('AZTR -- Clear Out Volume (30 sec)', '12:02:30'), tv('AZTR -- Clear Out Volume (30 sec)', '11:03:31')]
    expect(build(rows)).toHaveLength(2)
  })

  it('still collapses the live and stored copy of one trigger', () => {
    const live = tv('AZTR -- Capitulation Volume (30 sec)', '11:03:30')
    const stored = tv('AZTR -- Capitulation Volume (30 sec)', '11:03:30', 400)
    expect(build([live], [stored])).toHaveLength(1)
  })

  it('other types keep their dedup', () => {
    const f1 = a({ symbol: 'AZTR', type: 'filing', message: 'Azitra 8-K', timestamp: today('09:00:00') })
    const f2 = a({ symbol: 'AZTR', type: 'filing', message: 'Azitra 8-K', timestamp: today('09:05:00') })
    expect(build([f1], [f2])).toHaveLength(1)
  })
})

describe('catalyst rule unchanged', () => {
  it('a catalyst confirmer is hidden behind the PR it repeats', () => {
    const pr = a({ type: 'news', message: 'Davion Healthcare Announces Acquisition', timestamp: today('07:30:00') })
    const cat = a({ type: 'catalyst', message: 'Davion Healthcare Announces Acquisition ($4.10)', timestamp: today('07:30:06') })
    expect(build([], [pr, cat])).toEqual(['Davion Healthcare Announces Acquisition'])
  })
})
