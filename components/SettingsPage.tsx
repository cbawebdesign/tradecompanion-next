"use client"

import { useStore } from '@/store/useStore'
import { useState } from 'react'

export function SettingsPage() {
  const { config, updateConfig } = useStore()
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    // Config is auto-persisted by Zustand, but show feedback
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl h-full overflow-auto">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <div className="space-y-6">
        {/* Connection Settings */}
        <section className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Connection</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Hub URL</label>
              <input
                type="text"
                value={config.hubUrl}
                onChange={(e) => updateConfig({ hubUrl: e.target.value })}
                placeholder="https://stage.news.scanzzers.com"
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                SignalR hub URL for real-time data
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">API Key</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => updateConfig({ apiKey: e.target.value })}
                placeholder="Enter your API key"
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your authentication key for the trading API
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">TradingView ID</label>
              <input
                type="text"
                value={config.tradingViewId}
                onChange={(e) => updateConfig({ tradingViewId: e.target.value })}
                placeholder="Your TradingView username"
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* Alert Settings */}
        <section className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Alerts</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-300">Audio Alerts</label>
                <p className="text-xs text-gray-500">Play sound when alerts trigger</p>
              </div>
              <button
                onClick={() => updateConfig({ audioEnabled: !config.audioEnabled })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  config.audioEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${
                    config.audioEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Alert Bar Height ({config.alertBarHeight}px)
              </label>
              <input
                type="range"
                min="100"
                max="400"
                value={config.alertBarHeight}
                onChange={(e) => updateConfig({ alertBarHeight: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* Filter Settings */}
        <section className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Filters</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Min Market Cap</label>
              <input
                type="number"
                value={config.marketCapMin}
                onChange={(e) => updateConfig({ marketCapMin: parseInt(e.target.value) || 0 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Market Cap</label>
              <input
                type="number"
                value={config.marketCapMax}
                onChange={(e) => updateConfig({ marketCapMax: parseInt(e.target.value) || 999999999999 })}
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* UI Settings */}
        <section className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">UI Settings</h3>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Watchlist Split ({config.watchlistSplitPercent}%)
            </label>
            <input
              type="range"
              min="20"
              max="80"
              value={config.watchlistSplitPercent}
              onChange={(e) => updateConfig({ watchlistSplitPercent: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
        </section>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button onClick={handleSave} className="btn btn-primary">
            Save Settings
          </button>
          {saved && (
            <span className="text-green-400 text-sm">Settings saved!</span>
          )}
        </div>
      </div>
    </div>
  )
}
