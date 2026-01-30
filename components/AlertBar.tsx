"use client"

import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { formatDistanceToNow } from '@/lib/utils'

export function AlertBar() {
  const { alerts, config, clearAlerts } = useStore()

  // Only show unread alerts in the bar
  const recentAlerts = alerts.slice(0, 20)

  if (recentAlerts.length === 0) {
    return (
      <div
        className="bg-gray-800/50 border-b border-gray-700 px-4 py-2 text-sm text-gray-500"
        style={{ height: config.alertBarHeight }}
      >
        No alerts yet. Alerts will appear here in real-time.
      </div>
    )
  }

  return (
    <div
      className="bg-gray-800/50 border-b border-gray-700 overflow-y-auto"
      style={{ height: config.alertBarHeight }}
    >
      <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-b border-gray-700 sticky top-0">
        <span className="text-xs text-gray-400">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={clearAlerts}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Clear all
        </button>
      </div>
      <div className="divide-y divide-gray-800">
        {recentAlerts.map((alert) => (
          <div
            key={alert.id}
            className="alert-item px-4 py-2 flex items-start gap-3 hover:bg-gray-800/50"
          >
            <span
              className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
              style={{ backgroundColor: alert.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-sm">{alert.symbol}</span>
                <span className={clsx(
                  'text-xs px-1.5 py-0.5 rounded',
                  alert.type === 'price' && 'bg-green-900/50 text-green-400',
                  alert.type === 'filing' && 'bg-blue-900/50 text-blue-400',
                  alert.type === 'news' && 'bg-purple-900/50 text-purple-400',
                  alert.type === 'catalyst' && 'bg-orange-900/50 text-orange-400',
                  alert.type === 'trade_exchange' && 'bg-yellow-900/50 text-yellow-400',
                )}>
                  {alert.type}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(alert.timestamp)}
                </span>
              </div>
              <p className="text-sm text-gray-300 truncate">{alert.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
