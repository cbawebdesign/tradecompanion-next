import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '@/store/useStore'
import type { Alert } from '@/types'

/**
 * Deleting an alert in the TIMELINE must not erase it from the per-symbol
 * data ribbon, and must be remembered across a reload.
 *
 * Both of Justin's complaints came from one function doing the wrong thing in
 * two directions:
 *
 *   "TV alerts from previous close need to stay in the data ribbon. When they
 *    are deleted from the timeline, they are removed from the data ribbon."
 *
 *   "every now and then a Trade Exchange message or SEC filing will re-appear
 *    in the timeline after I already deleted it."
 *
 * They are not in conflict — they are two panes with two jobs. The timeline is
 * a queue you work down; the ribbon is the record for a symbol.
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
    // shouldShowAlert gates news/filing types on subscriptions, but "flagged
    // symbols get every alert, always" — which is how Justin works anyway.
    flaggedSymbols: new Set(['AAPL', 'TSLA']),
    watchlists: [],
    alertSubscriptions: [],
  })
})

describe('removeAlert — timeline delete', () => {
  it('hides it from the timeline', () => {
    const a = mk()
    useStore.getState().addAlert(a)
    useStore.getState().removeAlert(a.id)
    expect(useStore.getState().hiddenAlertIds.has(a.id)).toBe(true)
  })

  it('LEAVES the alert in the store so the ribbon still shows it', () => {
    // The regression that made the ribbon lose a symbol's history: this used to
    // splice from state.alerts, which the ribbon reads from.
    const a = mk()
    useStore.getState().addAlert(a)
    useStore.getState().removeAlert(a.id)

    const alerts = useStore.getState().alerts
    expect(alerts.some(x => x.id === a.id)).toBe(true)

    // What the ribbon actually computes — filter by symbol, no hidden check.
    const ribbon = alerts.filter(x => x.symbol === 'AAPL')
    expect(ribbon).toHaveLength(1)
  })

  it('remembers the deletion so the auditor will not re-inject it', () => {
    const a = mk({ symbol: 'TSLA', type: 'filing', message: '8-K: Material agreement' })
    useStore.getState().addAlert(a)
    useStore.getState().removeAlert(a.id)

    const keys = useStore.getState().removedAlertKeys
    expect(keys.size).toBe(1)
    // Normalised — the form-code prefix is stripped so it matches the key the
    // auditor builds from the un-prefixed REST feed.
    expect(Array.from(keys)[0]).toBe('TSLA|filing|material agreement')
  })

  it('is a no-op for an unknown id', () => {
    useStore.getState().addAlert(mk())
    const before = useStore.getState().alerts.length
    useStore.getState().removeAlert('not-a-real-id')
    expect(useStore.getState().alerts).toHaveLength(before)
    expect(useStore.getState().hiddenAlertIds.size).toBe(0)
    expect(useStore.getState().removedAlertKeys.size).toBe(0)
  })

  it('deleting one alert leaves the symbol\'s others alone', () => {
    const a = mk({ message: 'First headline' })
    const b = mk({ message: 'Second headline' })
    useStore.getState().addAlerts([a, b])
    useStore.getState().removeAlert(a.id)

    expect(useStore.getState().hiddenAlertIds.has(a.id)).toBe(true)
    expect(useStore.getState().hiddenAlertIds.has(b.id)).toBe(false)
    // Ribbon still sees both — deleting from your queue is not editing history.
    expect(useStore.getState().alerts.filter(x => x.symbol === 'AAPL')).toHaveLength(2)
  })
})

describe('what each pane sees', () => {
  it('timeline hides deleted, ribbon does not', () => {
    const a = mk({ message: 'Deleted one' })
    const b = mk({ message: 'Kept one' })
    useStore.getState().addAlerts([a, b])
    useStore.getState().removeAlert(a.id)

    const s = useStore.getState()
    // AlertBar's actual expression
    const timeline = s.alerts.filter(x => !s.hiddenAlertIds.has(x.id))
    // AlertsPage's actual expression
    const ribbon = s.alerts.filter(x => x.symbol === 'AAPL')

    expect(timeline).toHaveLength(1)
    expect(timeline[0].message).toBe('Kept one')
    expect(ribbon).toHaveLength(2)
  })
})
