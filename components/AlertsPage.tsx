"use client"

import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { formatDistanceToNow } from '@/lib/utils'

export function AlertsPage() {
  const { alerts, flaggedSymbols, clearAlerts, markAlertRead } = useStore()

  // Group alerts by symbol
  const alertsBySymbol = alerts.reduce((acc, alert) => {
    if (!acc[alert.symbol]) {
      acc[alert.symbol] = []
    }
    acc[alert.symbol].push(alert)
    return acc
  }, {} as Record<string, typeof alerts>)

  // Get flagged symbols with their alerts
  const flaggedWithAlerts = Array.from(flaggedSymbols).map(symbol => ({
    symbol,
    alerts: alertsBySymbol[symbol] || [],
    latestAlert: alertsBySymbol[symbol]?.[0] || null,
  }))

  return (
    <div className="flex h-full">
      {/* Flagged Symbols Panel */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300">Flagged Symbols</h3>
          <p className="text-xs text-gray-500 mt-1">
            {flaggedSymbols.size} flagged
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {flaggedWithAlerts.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              No flagged symbols. Flag symbols from the Watchlist tab.
            </p>
          ) : (
            flaggedWithAlerts.map(({ symbol, alerts, latestAlert }) => (
              <div
                key={symbol}
                className="px-3 py-2 border-b border-gray-700 hover:bg-gray-700/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{symbol}</span>
                  {alerts.length > 0 && (
                    <span className="text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">
                      {alerts.length}
                    </span>
                  )}
                </div>
                {latestAlert && (
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {latestAlert.message}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* All Alerts Panel */}
      <div className="flex-1 flex flex-col">
        <div className="p-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">All Alerts</h3>
            <p className="text-xs text-gray-500">
              {alerts.length} total alerts
            </p>
          </div>
          <button
            onClick={clearAlerts}
            className="btn btn-secondary text-xs"
          >
            Clear All
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {alerts.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              No alerts yet. Alerts will appear here when triggered.
            </p>
          ) : (
            <div className="divide-y divide-gray-800">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={clsx(
                    'p-3 hover:bg-gray-800/50 cursor-pointer',
                    !alert.read && 'bg-gray-800/30'
                  )}
                  onClick={() => markAlertRead(alert.id)}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                      style={{ backgroundColor: alert.color }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-semibold">{alert.symbol}</span>
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
                        <span className="text-xs text-gray-500 ml-auto">
                          {formatDistanceToNow(alert.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{alert.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
