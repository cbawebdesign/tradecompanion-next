"use client"

import { useStore } from '@/store/useStore'
import { useState, useEffect, useCallback } from 'react'
import { proxyUrl } from '@/lib/proxyUrl'
import { getSession, clearSession } from '@/components/LoginGate'
import type { AppTheme, MascotSize, MascotCharacter } from '@/types'
import { MASCOT_CHARACTERS } from './AlertMascot'

const THEMES: { value: AppTheme; label: string; description: string }[] = [
  { value: 'blue', label: 'Deep Blue', description: 'Deep blue trading terminal (default)' },
  { value: 'dark', label: 'Dark', description: 'Blue-tinted dark theme' },
  { value: 'wallst', label: 'Wall St', description: 'Classic black and green terminal' },
  { value: 'crimson', label: 'Crimson', description: 'Black and red aggressive style' },
  { value: 'nebula', label: 'Nebula', description: 'Deep purple and blue cosmic vibes' },
]

const APP_VERSION = '2.1.0'

export function SettingsPage() {
  const { config, updateConfig, connectionState, watchlists, setWatchlists, flaggedSymbols, alertSubscriptions } = useStore()
  const [saved, setSaved] = useState(false)

  // User sync state
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [changingKey, setChangingKey] = useState(false)

  // TradingView webhook registration state
  const [tvRegStatus, setTvRegStatus] = useState<'idle' | 'registering' | 'success' | 'error'>('idle')
  const [tvWebhookUrl, setTvWebhookUrl] = useState('')
  const [tvRegError, setTvRegError] = useState('')

  // Apply theme to document when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme || 'blue')
  }, [config.theme])

  const handleSave = () => {
    // Config is auto-persisted by Zustand, but show feedback
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // User Sync: Generate new key
  const handleGenerateKey = useCallback(async () => {
    setSyncStatus('syncing')
    setSyncMessage('Registering...')
    try {
      const resp = await fetch(proxyUrl(`${config.hubUrl}/user/register`), { method: 'POST' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      updateConfig({ userKey: data.user_key })
      setSyncStatus('success')
      setSyncMessage(`Key generated: ${data.user_key}`)
    } catch (err: any) {
      setSyncStatus('error')
      setSyncMessage(`Failed: ${err.message}`)
    }
  }, [config.hubUrl, updateConfig])

  // User Sync: Load existing key
  const handleLoadKey = useCallback(async () => {
    const key = keyInput.trim().toUpperCase()
    if (!key) return
    setSyncStatus('syncing')
    setSyncMessage('Validating key...')
    try {
      const resp = await fetch(proxyUrl(`${config.hubUrl}/user/${encodeURIComponent(key)}`))
      if (resp.status === 404) {
        setSyncStatus('error')
        setSyncMessage('Key not found')
        return
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const userData = await resp.json()
      console.log('[UserSync] Server returned:', JSON.stringify(userData, null, 2))
      updateConfig({ userKey: userData.user_key })

      // Restore watchlists if server has data
      // Server format: { "Main Watch": ["AAPL", "TSLA"], "Tech": ["GOOG"] }
      // Zustand format: [{ id, name, symbols: [{ symbol, upperAlert, lowerAlert, notes }] }]
      if (userData.watchlists && Object.keys(userData.watchlists).length > 0) {
        const restored = Object.entries(userData.watchlists).map(([name, symbols]: [string, any]) => ({
          id: crypto.randomUUID(),
          name,
          symbols: (symbols as string[]).map((sym: string) => ({
            symbol: sym,
            upperAlert: null,
            lowerAlert: null,
            notes: '',
          })),
        }))
        console.log('[UserSync] Restoring watchlists:', JSON.stringify(restored, null, 2))
        setWatchlists(restored)
        setSyncMessage(`Key valid. Restored ${restored.length} watchlist(s) with ${restored.reduce((n, wl) => n + wl.symbols.length, 0)} symbols.`)
      } else {
        console.log('[UserSync] No watchlists on server')
        setSyncMessage('Key valid. No server data to restore.')
      }
      setSyncStatus('success')
      setKeyInput('')
    } catch (err: any) {
      setSyncStatus('error')
      setSyncMessage(`Failed: ${err.message}`)
    }
  }, [keyInput, config.hubUrl, updateConfig, setWatchlists])

  // User Sync: Pull from server (restore watchlists/config)
  const handlePull = useCallback(async () => {
    if (!config.userKey) return
    setSyncStatus('syncing')
    setSyncMessage('Pulling from server...')
    try {
      const resp = await fetch(proxyUrl(`${config.hubUrl}/user/${encodeURIComponent(config.userKey)}`))
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const userData = await resp.json()
      console.log('[UserSync] Pull - server returned:', JSON.stringify(userData, null, 2))

      if (userData.watchlists && Object.keys(userData.watchlists).length > 0) {
        const restored = Object.entries(userData.watchlists).map(([name, symbols]: [string, any]) => ({
          id: crypto.randomUUID(),
          name,
          symbols: (symbols as string[]).map((sym: string) => ({
            symbol: sym,
            upperAlert: null,
            lowerAlert: null,
            notes: '',
          })),
        }))
        console.log('[UserSync] Restoring watchlists:', JSON.stringify(restored, null, 2))
        setWatchlists(restored)
        setSyncStatus('success')
        setSyncMessage(`Pulled ${restored.length} watchlist(s) with ${restored.reduce((n, wl) => n + wl.symbols.length, 0)} symbols from server.`)
      } else {
        setSyncStatus('success')
        setSyncMessage('Server has no watchlist data to pull.')
      }
    } catch (err: any) {
      setSyncStatus('error')
      setSyncMessage(`Pull failed: ${err.message}`)
    }
  }, [config.userKey, config.hubUrl, setWatchlists])

  // User Sync: Push current state to server
  const handlePush = useCallback(async () => {
    if (!config.userKey) return
    setSyncStatus('syncing')
    setSyncMessage('Pushing to server...')
    try {
      const watchlistData: Record<string, string[]> = {}
      watchlists.forEach(wl => {
        watchlistData[wl.name] = wl.symbols.map(s => s.symbol)
      })

      const configData: Record<string, string> = {
        theme: config.theme,
        hubUrl: config.hubUrl,
        tradingViewId: config.tradingViewId,
        audioEnabled: String(config.audioEnabled),
        marketCapMin: String(config.marketCapMin),
        marketCapMax: String(config.marketCapMax),
      }

      const payload = {
        id: config.userKey,
        user_key: config.userKey,
        watchlists: watchlistData,
        configs: configData,
        flagged_symbols: Array.from(flaggedSymbols),
      }

      console.log('[UserSync] Pushing payload:', JSON.stringify(payload, null, 2))

      const resp = await fetch(proxyUrl(`${config.hubUrl}/user/${encodeURIComponent(config.userKey)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setSyncStatus('success')
      setSyncMessage('Pushed to server successfully')
    } catch (err: any) {
      setSyncStatus('error')
      setSyncMessage(`Push failed: ${err.message}`)
    }
  }, [config, watchlists, flaggedSymbols])

  // TradingView webhook registration
  const handleTvRegister = useCallback(async () => {
    if (!config.tradingViewId) return
    setTvRegStatus('registering')
    setTvRegError('')
    setTvWebhookUrl('')
    try {
      // Generate a random webhook key
      const webhookKey = crypto.randomUUID().replace(/-/g, '').substring(0, 16)
      const trimmedUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
      const resp = await fetch(proxyUrl(`${trimmedUrl}/api/tv/register`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: config.tradingViewId, webhook_key: webhookKey }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const url = data.webhook_url || `${trimmedUrl}/api/tv/${webhookKey}`
      setTvWebhookUrl(url)
      setTvRegStatus('success')
    } catch (err: any) {
      setTvRegStatus('error')
      setTvRegError(err.message)
    }
  }, [config.tradingViewId, config.hubUrl])

  const handleCopyKey = useCallback(() => {
    if (config.userKey) {
      navigator.clipboard.writeText(config.userKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [config.userKey])

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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.tradingViewId}
                  onChange={(e) => updateConfig({ tradingViewId: e.target.value })}
                  placeholder="Your TradingView username"
                  className="flex-1"
                />
                <button
                  onClick={handleTvRegister}
                  disabled={!config.tradingViewId || tvRegStatus === 'registering'}
                  className="btn btn-secondary text-xs px-3 py-2 whitespace-nowrap"
                >
                  {tvRegStatus === 'registering' ? 'Registering...' : 'Register Webhook'}
                </button>
              </div>
              {tvWebhookUrl && (
                <div className="mt-2 p-2 rounded text-xs" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
                  <p className="text-green-400 mb-1">Webhook registered! Use this URL in TradingView alerts:</p>
                  <code className="block break-all" style={{ color: 'var(--accent-primary)' }}>{tvWebhookUrl}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(tvWebhookUrl); }}
                    className="btn btn-secondary text-xs px-2 py-1 mt-1"
                  >
                    Copy URL
                  </button>
                </div>
              )}
              {tvRegError && (
                <p className="text-xs text-red-400 mt-1">Registration failed: {tvRegError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">News Hub API Key</label>
              <input
                type="password"
                value={config.newsApiKey || ''}
                onChange={(e) => updateConfig({ newsApiKey: e.target.value })}
                placeholder="Enter news hub API key"
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Direct connection to news hub for real-time PR alerts
              </p>
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

        {/* User Sync */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>User Sync</h3>
          <div className="space-y-4">
            {config.userKey ? (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Your Key</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded text-sm font-mono" style={{ background: 'var(--bg-glass)', color: 'var(--accent-primary)' }}>
                      {config.userKey}
                    </code>
                    <button
                      onClick={handleCopyKey}
                      className="btn btn-secondary text-xs px-3 py-2"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Save this key to restore your settings on another device
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePull}
                    disabled={syncStatus === 'syncing'}
                    className="btn btn-primary flex-1"
                  >
                    {syncStatus === 'syncing' ? 'Syncing...' : 'Pull from Server'}
                  </button>
                  <button
                    onClick={handlePush}
                    disabled={syncStatus === 'syncing'}
                    className="btn btn-secondary flex-1"
                  >
                    {syncStatus === 'syncing' ? 'Syncing...' : 'Push to Server'}
                  </button>
                </div>
                {changingKey ? (
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-400">Enter New Key</label>
                    <p className="text-xs text-gray-500">Current: {config.userKey}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                        placeholder="TC-XXXXXX"
                        className="flex-1"
                      />
                      <button
                        onClick={() => { handleLoadKey(); setChangingKey(false) }}
                        disabled={syncStatus === 'syncing' || !keyInput.trim()}
                        className="btn btn-primary"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => { setChangingKey(false); setKeyInput('') }}
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChangingKey(true)}
                      className="btn btn-secondary flex-1 text-xs"
                    >
                      Change Key
                    </button>
                    <button
                      onClick={() => updateConfig({ userKey: '' })}
                      className="btn btn-secondary flex-1 text-xs"
                    >
                      Disconnect Key
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleGenerateKey}
                  disabled={syncStatus === 'syncing'}
                  className="btn btn-primary w-full"
                >
                  {syncStatus === 'syncing' ? 'Generating...' : 'Generate New Key'}
                </button>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex-1 h-px" style={{ background: 'var(--border-glass)' }} />
                  <span className="text-xs">or</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border-glass)' }} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Enter Existing Key</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                      placeholder="TC-XXXXXX"
                      className="flex-1"
                    />
                    <button
                      onClick={handleLoadKey}
                      disabled={syncStatus === 'syncing' || !keyInput.trim()}
                      className="btn btn-primary"
                    >
                      Load
                    </button>
                  </div>
                </div>
              </>
            )}
            {syncMessage && (
              <p className={`text-xs ${syncStatus === 'error' ? 'text-red-400' : syncStatus === 'success' ? 'text-green-400' : 'text-gray-400'}`}>
                {syncMessage}
              </p>
            )}
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

        {/* Mascot Settings */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Alert Mascot</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm" style={{ color: 'var(--text-primary)' }}>Show Mascot</label>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Floating mascot reacts to alerts</p>
              </div>
              <button
                onClick={() => updateConfig({ mascotEnabled: !config.mascotEnabled })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  config.mascotEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${
                    config.mascotEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Character</label>
              <div className="flex gap-3">
                {(Object.entries(MASCOT_CHARACTERS) as [MascotCharacter, typeof MASCOT_CHARACTERS[keyof typeof MASCOT_CHARACTERS]][]).map(([key, char]) => (
                  <button
                    key={key}
                    onClick={() => updateConfig({ mascotCharacter: key })}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${
                      config.mascotCharacter === key
                        ? 'ring-2 ring-blue-500 bg-blue-500/10'
                        : 'hover:bg-white/5'
                    }`}
                    style={{ border: '1px solid var(--border-glass)' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={char.idle}
                      alt={char.label}
                      width={48}
                      height={48}
                      className="w-12 h-12 object-contain"
                      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{char.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Size</label>
              <div className="flex gap-2">
                {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as [MascotSize, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => updateConfig({ mascotSize: value })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                      config.mascotSize === value
                        ? 'ring-2 ring-blue-500 bg-blue-500/10'
                        : 'hover:bg-white/5'
                    }`}
                    style={{ border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
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

      {/* Version & Status Footer */}
      <div className="mt-6 pt-4 flex items-center gap-6 text-xs" style={{ borderTop: '1px solid var(--border-glass)', color: 'var(--text-muted)' }}>
        <span>v{APP_VERSION}</span>
        <span>
          Connection:{' '}
          <span className={
            connectionState === 'connected' ? 'text-green-400' :
            connectionState === 'reconnecting' ? 'text-yellow-400' :
            'text-red-400'
          }>
            {connectionState}
          </span>
        </span>
        {config.userKey && (
          <span>
            User: <span style={{ color: 'var(--accent-primary)' }}>{config.userKey}</span>
          </span>
        )}
        <span>Hub: {config.hubUrl ? new URL(config.hubUrl).hostname : 'not set'}</span>
        {getSession() && (
          <button
            onClick={() => {
              clearSession()
              window.location.reload()
            }}
            className="ml-auto px-3 py-1 rounded text-xs font-medium transition-all hover:bg-red-500/20"
            style={{
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            Logout
          </button>
        )}
      </div>
    </div>
  )
}
