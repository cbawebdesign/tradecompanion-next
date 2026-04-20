"use client"

import { useStore } from '@/store/useStore'
import { GATED_SUBSCRIPTION_KEYS, SUBSCRIPTION_LABELS } from '@/lib/alertFilter'
import type { AlertType } from '@/types'

interface Props {
  watchlistId: string
  onClose: () => void
}

export function WatchlistSubscriptionsModal({ watchlistId, onClose }: Props) {
  const watchlist = useStore(s => s.watchlists.find(w => w.id === watchlistId))
  const subscriptions = useStore(s => s.alertSubscriptions)
  const addAlertSubscription = useStore(s => s.addAlertSubscription)
  const removeAlertSubscription = useStore(s => s.removeAlertSubscription)

  if (!watchlist) return null

  const isSubscribed = (type: AlertType) =>
    subscriptions.some(s => s.watchlistId === watchlistId && s.alertType === type)

  const toggle = (type: AlertType) => {
    const existing = subscriptions.find(s => s.watchlistId === watchlistId && s.alertType === type)
    if (existing) {
      removeAlertSubscription(existing.id)
    } else {
      addAlertSubscription(type, watchlistId)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-lg p-5 w-full max-w-md"
        style={{ maxWidth: '420px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Alert subscriptions
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--accent-primary)' }}>{watchlist.name}</span>
              {' '}· {watchlist.symbols.length} symbol{watchlist.symbols.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xl leading-none -mt-1 -mr-1 px-2"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Choose which alert types land in the timeline for symbols on this watchlist.
          Flagged symbols always receive everything, regardless of these settings.
          TradingView, Catalyst, RSS, Mail, and YouTube are always on.
        </p>

        <div className="space-y-1">
          {GATED_SUBSCRIPTION_KEYS.map((type) => {
            const on = isSubscribed(type)
            return (
              <button
                key={type}
                onClick={() => toggle(type)}
                className="w-full flex items-center justify-between px-3 py-2 rounded text-left transition-colors"
                style={{
                  background: on ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${on ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-glass)'}`,
                }}
              >
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {SUBSCRIPTION_LABELS[type]}
                </span>
                <span
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{ background: on ? 'rgb(59, 130, 246)' : 'rgb(75, 85, 99)' }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                    style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }}
                  />
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => {
              // Turn all on for this watchlist
              for (const key of GATED_SUBSCRIPTION_KEYS) {
                if (!isSubscribed(key)) addAlertSubscription(key, watchlistId)
              }
            }}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
          >
            All on
          </button>
          <button
            onClick={() => {
              // Turn all off
              for (const key of GATED_SUBSCRIPTION_KEYS) {
                const existing = subscriptions.find(s => s.watchlistId === watchlistId && s.alertType === key)
                if (existing) removeAlertSubscription(existing.id)
              }
            }}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
          >
            All off
          </button>
          <button
            onClick={onClose}
            className="btn btn-primary text-xs py-1.5 px-3"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
