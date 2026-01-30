"use client"

import { useState } from 'react'
import { useStore } from '@/store/useStore'
import type { AlertType } from '@/types'

const ALERT_TYPES: AlertType[] = [
  'PRs',
  'Filings',
  'X',
  'FilteredPRs',
  'TradeExchange',
  'TradeExchangeFiltered',
  'AfternoonBreakout',
  'TradingViewWebhooks',
]

export function AlertConfig() {
  const {
    alertSubscriptions,
    addAlertSubscription,
    removeAlertSubscription,
    toggleAlertSubscriptionAudio,
    watchlists,
  } = useStore()

  const [selectedAlertType, setSelectedAlertType] = useState<AlertType>('TradingViewWebhooks')
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>(watchlists[0]?.id || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAlertType || !selectedWatchlistId) return
    addAlertSubscription(selectedAlertType, selectedWatchlistId)
  }

  const getWatchlistName = (watchlistId: string) => {
    return watchlists.find(w => w.id === watchlistId)?.name || 'Unknown'
  }

  return (
    <div className="p-4">
      {/* Running Alerts */}
      <h2 className="text-lg font-semibold mb-3">Running Alerts</h2>
      <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">Alert</th>
              <th className="px-4 py-2 text-left">Watchlist</th>
              <th className="px-4 py-2 text-center">Audio Enabled</th>
              <th className="px-4 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {alertSubscriptions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No alert subscriptions. Add one below.
                </td>
              </tr>
            ) : (
              alertSubscriptions.map((sub) => (
                <tr key={sub.id} className="border-t border-gray-700">
                  <td className="px-4 py-2 font-medium">{sub.alertType}</td>
                  <td className="px-4 py-2 text-gray-400">{getWatchlistName(sub.watchlistId)}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => toggleAlertSubscriptionAudio(sub.id)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        sub.audioEnabled ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                          sub.audioEnabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => removeAlertSubscription(sub.id)}
                      className="text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Alert Form */}
      <h2 className="text-lg font-semibold mb-3">New Alert</h2>
      <form onSubmit={handleSubmit} className="flex items-end gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Alert</label>
          <select
            value={selectedAlertType}
            onChange={(e) => setSelectedAlertType(e.target.value as AlertType)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm min-w-[200px]"
          >
            {ALERT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Watchlist</label>
          <select
            value={selectedWatchlistId}
            onChange={(e) => setSelectedWatchlistId(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm min-w-[150px]"
          >
            {watchlists.map((wl) => (
              <option key={wl.id} value={wl.id}>{wl.name}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="btn btn-primary px-6 py-2"
        >
          Submit
        </button>
      </form>
    </div>
  )
}
