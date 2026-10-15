import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '@/store/useStore'
import type { Alert } from '@/types'

/**
 * addAlert / addAlerts admission, and the dedup inside it.
 *
 * This is the code most able to lose an alert silently, and it has been the
 * largest untested surface in the repo — tests/README.md has named it as the
 * natural next step since the suite was written. Everything that reaches the
 * timeline passes through here: three redundant ingest paths deliberately
 * deliver the same event more than once, and this function decides which copies
 * survive.
 *
 * Getting it wrong in either direction is bad, asymmetrically:
 *   too strict  -> a real alert never appears, which is the cardinal sin
 *   too loose   -> the same story prints twice and the timeline gets noisy
 *
 * These are characterization tests: they pin what the code does today so a
 * change has to be deliberate.
 */

const mk = (over: Partial<Alert> = {}): Alert => ({
  id: crypto.randomUUID(),
  symbol: 'AAPL',
  message: 'Apple beats on earnings',
  type: 'news',
  color: '#2563eb',
  timestamp: new Date(),
  read: false,
  ...over,
})

beforeEach(() => {
  useStore.setState({
    alerts: [],
    hiddenAlertIds: new Set<string>(),
    removedAlertKeys: new Set<string>(),
    clearedSince: null,
    // Flagged symbols bypass the subscription gate entirely, which keeps these
    // tests about dedup rather than about subscriptions.
    flaggedSymbols: new Set(['AAPL', 'TSLA', 'NVDA']),
    watchlists: [],
    alertSubscriptions: [],
    config: { ...useStore.getState().config, excludePrPatterns: '', hideBlockedSymbols: false },
  })
})

const alerts = () => useStore.getState().alerts

describe('dedupKey — a match is a positive signal', () => {
  it('drops a replay carrying the same dedupKey', () => {
    useStore.getState().addAlert(mk({ dedupKey: 'pr:12345' }))
    useStore.getState().addAlert(mk({ dedupKey: 'pr:12345', id: 'second' }))
    expect(alerts()).toHaveLength(1)
  })

  it('keeps two genuinely different stories for the same symbol', () => {
    useStore.getState().addAlert(mk({ dedupKey: 'pr:1', message: 'Apple beats on earnings' }))
    useStore.getState().addAlert(mk({ dedupKey: 'pr:2', message: 'Apple announces buyback' }))
    expect(alerts()).toHaveLength(2)
  })
})

describe('a dedupKey MISS is not a signal of uniqueness', () => {
  it('still collapses the same story arriving with different keys', () => {
    // The case this behaviour exists for: the REST poll and the SignalR frame
    // for one Trade Exchange post carry different ids, because SignalR falls
    // back to Date.now() when the server frame omits one. Short-circuiting on a
    // key mismatch would print both.
    useStore.getState().addAlert(mk({ type: 'trade_exchange', dedupKey: 'tx:111', message: 'CRDO wins contract' }))
    useStore.getState().addAlert(mk({ type: 'trade_exchange', dedupKey: 'tx:999', message: 'CRDO wins contract' }))
    expect(alerts()).toHaveLength(1)
  })

  it('collapses across the [Source] prefix the two paths disagree on', () => {
    useStore.getState().addAlert(mk({ type: 'trade_exchange', message: '[TX-News1] CRDO wins contract' }))
    useStore.getState().addAlert(mk({ type: 'trade_exchange', message: 'CRDO wins contract' }))
    expect(alerts()).toHaveLength(1)
  })

  it('collapses across the catalyst price suffix', () => {
    useStore.getState().addAlert(mk({ type: 'catalyst', message: 'Apple beats on earnings ($212.40)' }))
    useStore.getState().addAlert(mk({ type: 'catalyst', message: 'Apple beats on earnings' }))
    expect(alerts()).toHaveLength(1)
  })
})

describe('message dedup is scoped — it must not over-collapse', () => {
  it('does NOT collapse the same headline on different symbols', () => {
    // A wire story naming two companies is two alerts, not one.
    useStore.getState().addAlert(mk({ symbol: 'AAPL', message: 'Chip supply deal signed' }))
    useStore.getState().addAlert(mk({ symbol: 'NVDA', message: 'Chip supply deal signed' }))
    expect(alerts()).toHaveLength(2)
  })

  it('does NOT collapse the same text arriving as different alert types', () => {
    useStore.getState().addAlert(mk({ type: 'news', message: 'Apple 8-K filed' }))
    useStore.getState().addAlert(mk({ type: 'filing', message: 'Apple 8-K filed' }))
    expect(alerts()).toHaveLength(2)
  })
})

describe('TradingView repeats are real signal, never message-deduped', () => {
  it('keeps the same setup firing twice in a day', () => {
    // Justin confirmed via the admin dashboard that these arrived and were being
    // dropped as duplicates. The same setup firing again is a new, tradeable
    // event — not a replay.
    useStore.getState().addAlert(mk({ type: 'tradingview', symbol: 'TSLA', message: 'TSLA crossing 250' }))
    useStore.getState().addAlert(mk({ type: 'tradingview', symbol: 'TSLA', message: 'TSLA crossing 250' }))
    expect(alerts()).toHaveLength(2)
  })

  it('but an exact dedupKey replay is still dropped', () => {
    // Reconnect backfill re-sends the same alert id; that one IS a replay.
    useStore.getState().addAlert(mk({ type: 'tradingview', dedupKey: 'tv:abc', message: 'TSLA crossing 250' }))
    useStore.getState().addAlert(mk({ type: 'tradingview', dedupKey: 'tv:abc', message: 'TSLA crossing 250' }))
    expect(alerts()).toHaveLength(1)
  })
})

describe('the cleared-timeline floor', () => {
  it('drops a backfilled alert older than the clear', () => {
    useStore.getState().clearAlerts()
    useStore.getState().addAlert(mk({ timestamp: new Date(Date.now() - 60 * 60 * 1000) }))
    expect(alerts()).toHaveLength(0)
  })

  it('lets a live alert through after a clear', () => {
    useStore.getState().clearAlerts()
    useStore.getState().addAlert(mk({ timestamp: new Date() }))
    expect(alerts()).toHaveLength(1)
  })

  it('drops an alert whose timestamp will not parse', () => {
    // Almost always a backfill path missing its source date field. Losing a
    // stray live alert is the safer side of this trade.
    useStore.getState().clearAlerts()
    useStore.getState().addAlert(mk({ timestamp: new Date('not a date') }))
    expect(alerts()).toHaveLength(0)
  })
})

describe('addAlerts — the batch path must match addAlert', () => {
  it('collapses duplicates inside the incoming batch against what is held', () => {
    useStore.getState().addAlert(mk({ dedupKey: 'pr:1', message: 'Apple beats on earnings' }))
    useStore.getState().addAlerts([
      mk({ dedupKey: 'pr:1', message: 'Apple beats on earnings' }),
      mk({ dedupKey: 'pr:2', message: 'Apple announces buyback' }),
    ])
    expect(alerts()).toHaveLength(2)
  })

  it('applies the same normalized-message rule as addAlert', () => {
    useStore.getState().addAlert(mk({ type: 'trade_exchange', message: '[TX-News1] CRDO wins contract' }))
    useStore.getState().addAlerts([mk({ type: 'trade_exchange', dedupKey: 'tx:other', message: 'CRDO wins contract' })])
    expect(alerts()).toHaveLength(1)
  })

  it('exempts TradingView from message dedup, like addAlert', () => {
    useStore.getState().addAlert(mk({ type: 'tradingview', message: 'TSLA crossing 250' }))
    useStore.getState().addAlerts([mk({ type: 'tradingview', message: 'TSLA crossing 250' })])
    expect(alerts()).toHaveLength(2)
  })

  it('applies the cleared floor', () => {
    useStore.getState().clearAlerts()
    useStore.getState().addAlerts([
      mk({ timestamp: new Date(Date.now() - 60 * 60 * 1000) }),
      mk({ timestamp: new Date(), message: 'Live one' }),
    ])
    expect(alerts()).toHaveLength(1)
    expect(alerts()[0].message).toBe('Live one')
  })
})

describe('ordering and cap', () => {
  it('keeps the timeline newest-first regardless of arrival order', () => {
    // Backfill races used to land grouped by alert type; Justin wants everything
    // interleaved chronologically.
    const old = mk({ message: 'older', timestamp: new Date(Date.now() - 10 * 60 * 1000) })
    const recent = mk({ message: 'newer', timestamp: new Date() })
    useStore.getState().addAlert(old)
    useStore.getState().addAlert(recent)
    expect(alerts().map((a) => a.message)).toEqual(['newer', 'older'])
  })

  it('caps the store at 500', () => {
    const batch = Array.from({ length: 520 }, (_, i) =>
      mk({ message: `story ${i}`, dedupKey: `pr:${i}`, timestamp: new Date(Date.now() - i * 1000) })
    )
    useStore.getState().addAlerts(batch)
    expect(alerts()).toHaveLength(500)
  })
})
