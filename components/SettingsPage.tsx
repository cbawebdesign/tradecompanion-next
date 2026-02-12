"use client"

import { useStore } from '@/store/useStore'
import { useState, useEffect } from 'react'
import type { AppTheme } from '@/types'

const THEMES: { value: AppTheme; label: string; description: string }[] = [
  { value: 'blue', label: 'Deep Blue', description: 'Deep blue trading terminal (default)' },
  { value: 'dark', label: 'Dark', description: 'Blue-tinted dark theme' },
  { value: 'wallst', label: 'Wall St', description: 'Classic black and green terminal' },
  { value: 'crimson', label: 'Crimson', description: 'Black and red aggressive style' },
  { value: 'nebula', label: 'Nebula', description: 'Deep purple and blue cosmic vibes' },
]

export function SettingsPage() {
  const { config, updateConfig } = useStore()
  const [saved, setSaved] = useState(false)

  // Apply theme to document when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme || 'blue')
  }, [config.theme])

  const handleSave = () => {
    // Config is auto-persisted by Zustand, but show feedback
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Settings</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Settings */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Connection</h3>
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

            <div>
              <label className="block text-sm text-gray-400 mb-1">Grok API Key (xAI)</label>
              <input
                type="password"
                value={config.grokApiKey || ''}
                onChange={(e) => updateConfig({ grokApiKey: e.target.value })}
                placeholder="xai-..."
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                For stock research AI. Get key at x.ai
              </p>
            </div>
          </div>
        </section>

        {/* Theme Settings */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Theme</h3>
          <div className="space-y-3">
            {THEMES.map((theme) => (
              <label
                key={theme.value}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                  config.theme === theme.value
                    ? 'ring-2 ring-blue-500 bg-blue-500/10'
                    : 'hover:bg-white/5'
                }`}
                style={{ border: '1px solid var(--border-glass)' }}
              >
                <input
                  type="radio"
                  name="theme"
                  value={theme.value}
                  checked={config.theme === theme.value}
                  onChange={() => updateConfig({ theme: theme.value })}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{theme.label}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{theme.description}</div>
                </div>
                {/* Theme preview swatch */}
                <div className="flex gap-1">
                  {theme.value === 'dark' && (
                    <>
                      <div className="w-4 h-4 rounded" style={{ background: '#111827' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#1f2937' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#3b82f6' }} />
                    </>
                  )}
                  {theme.value === 'blue' && (
                    <>
                      <div className="w-4 h-4 rounded" style={{ background: '#0f172a' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#1e293b' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#38bdf8' }} />
                    </>
                  )}
                  {theme.value === 'wallst' && (
                    <>
                      <div className="w-4 h-4 rounded" style={{ background: '#000000' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#0a0a0a' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#22c55e' }} />
                    </>
                  )}
                  {theme.value === 'crimson' && (
                    <>
                      <div className="w-4 h-4 rounded" style={{ background: '#0a0000' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#1a0f0f' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#ef4444' }} />
                    </>
                  )}
                  {theme.value === 'nebula' && (
                    <>
                      <div className="w-4 h-4 rounded" style={{ background: '#0c0015' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#1e0a3a' }} />
                      <div className="w-4 h-4 rounded" style={{ background: '#a78bfa' }} />
                    </>
                  )}
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Alert Settings */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Alerts</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm" style={{ color: 'var(--text-primary)' }}>Audio Alerts</label>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Play sound when alerts trigger</p>
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
              <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
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
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Filters</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Min Market Cap</label>
              <input
                type="number"
                value={config.marketCapMin}
                onChange={(e) => updateConfig({ marketCapMin: parseInt(e.target.value) || 0 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Max Market Cap</label>
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
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Layout</h3>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
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
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4 mt-6">
        <button onClick={handleSave} className="btn btn-primary">
          Save Settings
        </button>
        {saved && (
          <span className="text-green-400 text-sm">Settings saved!</span>
        )}
      </div>
    </div>
  )
}
