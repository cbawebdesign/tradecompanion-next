"use client"

import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { GrokButton } from './GrokButton'
import { PopOutButton } from './PopOutButton'
import { AlertConfig } from './AlertConfig'
import { StockDataRibbon } from './StockDataRibbon'
import type { Alert } from '@/types'

// Check if alert should show Grok button (filings/PRs with URL)
const shouldShowGrok = (alert: Alert): boolean => {
  if (!alert.url) return false
  const type = alert.type.toLowerCase()
  return type === 'filing' || type.includes('pr') || type.includes('filing')
}

interface AlertsPageProps {
  isPopout?: boolean
}

export function AlertsPage({ isPopout = false }: AlertsPageProps) {
  const {
    alerts,
    flaggedSymbols,
    toggleFlag,
    clearAlerts,
    quotes,
    selectedSymbol,
    setSelectedSymbol,
    activePane,
    setActivePane,
    config,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const isActive = activePane === 'alerts'

  const [splitPercent, setSplitPercent] = useState(50)
  const [showConfig, setShowConfig] = useState(false) // Closed by default

  // Handle click to set focus
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        setActivePane('alerts')
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [setActivePane])

  // Keyboard navigation - only when this pane is active
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const flaggedArray = Array.from(flaggedSymbols)
      if (flaggedArray.length === 0) return

      const currentIndex = selectedSymbol ? flaggedArray.indexOf(selectedSymbol) : -1

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const nextIndex = currentIndex < flaggedArray.length - 1 ? currentIndex + 1 : 0
        setSelectedSymbol(flaggedArray[nextIndex])
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : flaggedArray.length - 1
        setSelectedSymbol(flaggedArray[prevIndex])
      } else if (e.key === ' ' && selectedSymbol) {
        // Space to unflag
        e.preventDefault()
        toggleFlag(selectedSymbol)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, flaggedSymbols, selectedSymbol, setSelectedSymbol, toggleFlag])

  // Convert flagged symbols to array with quote data
  const flaggedList = Array.from(flaggedSymbols).map(symbol => ({
    symbol,
    quote: quotes[symbol],
    alertCount: alerts.filter(a => a.symbol === symbol).length,
  }))

  // DB alerts state
  const [dbAlerts, setDbAlerts] = useState<Alert[]>([])
  const [dbAlertsSymbol, setDbAlertsSymbol] = useState<string | null>(null)
  const [dbAlertsLoading, setDbAlertsLoading] = useState(false)

  // Fetch DB alerts when selected symbol changes
  useEffect(() => {
    if (!selectedSymbol) {
      setDbAlerts([])
      setDbAlertsSymbol(null)
      return
    }
    if (selectedSymbol === dbAlertsSymbol) return

    const controller = new AbortController()
    setDbAlertsLoading(true)
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    fetch(`${config.hubUrl}/AlertsBySymbol?symbol=${encodeURIComponent(selectedSymbol)}`, { signal: controller.signal })
      .then(r => {
        clearTimeout(timeoutId)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        const mapped: Alert[] = []
        data.tweets?.forEach((t: any) => {
          mapped.push({ id: `db-tweet-${t.time}-${t.source}`, symbol: selectedSymbol, message: t.text, type: 'news', color: '', timestamp: new Date(t.time), read: false })
        })
        data.filings?.forEach((f: any) => {
          mapped.push({ id: `db-filing-${f.time}-${f.source}`, symbol: selectedSymbol, message: f.text, type: 'filing', color: '', timestamp: new Date(f.time), read: false, url: f.url })
        })
        data.tradeExchange?.forEach((tx: any) => {
          mapped.push({ id: `db-tx-${tx.time}-${tx.source}`, symbol: selectedSymbol, message: tx.text, type: 'trade_exchange', color: '', timestamp: new Date(tx.time), read: false })
        })
        data.tradingView?.forEach((tv: any) => {
          mapped.push({ id: `db-tv-${tv.time}`, symbol: selectedSymbol, message: tv.text, type: 'news', color: '', timestamp: new Date(tv.time), read: false })
        })
        setDbAlerts(mapped)
        setDbAlertsSymbol(selectedSymbol)
        setDbAlertsLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') setDbAlertsLoading(false)
      })

    return () => { controller.abort(); clearTimeout(timeoutId) }
  }, [selectedSymbol, config.hubUrl])

  // Merge live + DB alerts
  const liveAlerts = selectedSymbol ? alerts.filter(a => a.symbol === selectedSymbol) : []
  const mergedDbAlerts = dbAlertsSymbol === selectedSymbol ? dbAlerts : []
  const seenKeys = new Set<string>()
  const symbolAlerts = [...liveAlerts, ...mergedDbAlerts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .filter(a => {
      const key = `${a.message}-${new Date(a.timestamp).toISOString().substring(11, 19)}`
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })

  const formatTime = (date: Date) => {
    const d = new Date(date)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        'glass-panel rounded-lg flex flex-col h-full transition-all duration-200',
        isActive ? 'pane-active' : 'pane-inactive'
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 glass-header rounded-t-lg flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Alerts</h3>
          {/* Wrench icon to toggle config */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-1 rounded transition-colors ${showConfig ? 'text-blue-400 bg-blue-900/30' : 'text-gray-400 hover:text-gray-300'}`}
            title="Toggle alert configuration"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearAlerts}
            className="btn btn-secondary text-xs"
          >
            Clear All Alerts
          </button>
          {!isPopout && (
            <PopOutButton route="/pop/alerts" title="Alerts" width={1000} height={600} />
          )}
        </div>
      </div>

      {/* Alert Config Section - Collapsible */}
      {showConfig && (
        <div className="max-h-[45%] overflow-auto" style={{ borderBottom: '1px solid var(--border-glass)' }}>
          <AlertConfig />
        </div>
      )}

      {/* Flagged Symbols Header */}
      <div className="px-3 py-2 flex-shrink-0" style={{ background: 'var(--bg-glass-light)', borderBottom: '1px solid var(--border-glass)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Flagged Symbols</h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{flaggedList.length} flagged</p>
      </div>

      {/* Main Content - LEFT/RIGHT Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANE - Flagged Symbols Table */}
        <div className="flex flex-col overflow-hidden" style={{ width: `${splitPercent}%` }}>
          <div className="flex-1 overflow-auto table-container">
            {flaggedList.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                No flagged symbols. Flag symbols from the Watchlist or AlertBar.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th className="w-8">Flag</th>
                    <th>Symbol</th>
                    <th className="text-right">Last</th>
                    <th className="text-right">Bid</th>
                    <th className="text-right">Ask</th>
                    <th className="text-right">% Chg</th>
                    <th className="text-right">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {flaggedList.map(({ symbol, quote, alertCount }) => {
                    const changeClass = quote?.change > 0 ? 'price-up' : quote?.change < 0 ? 'price-down' : 'price-neutral'

                    return (
                      <tr
                        key={symbol}
                        onClick={() => setSelectedSymbol(symbol)}
                        className={clsx(
                          'cursor-pointer',
                          selectedSymbol === symbol && 'selected'
                        )}
                      >
                        <td className="text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFlag(symbol)
                            }}
                            className="text-lg text-yellow-400"
                          >
                            ⚑
                          </button>
                        </td>
                        <td className="font-mono font-semibold">{symbol}</td>
                        <td className={clsx('text-right font-mono', changeClass)}>
                          {quote?.last?.toFixed(2) || '-'}
                        </td>
                        <td className="text-right font-mono text-gray-400">
                          {quote?.bid?.toFixed(2) || '-'}
                        </td>
                        <td className="text-right font-mono text-gray-400">
                          {quote?.ask?.toFixed(2) || '-'}
                        </td>
                        <td className={clsx('text-right font-mono', changeClass)}>
                          {quote?.changePercent ? `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '-'}
                        </td>
                        <td className="text-right">
                          {alertCount > 0 && (
                            <span className="text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">
                              {alertCount}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Vertical Resize Handle */}
        <div
          className="w-1 cursor-col-resize flex-shrink-0 transition-colors"
          style={{ background: 'var(--border-glass)' }}
          onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'var(--accent-primary)'}
          onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'var(--border-glass)'}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startPercent = splitPercent

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const container = (e.target as HTMLElement).parentElement
              if (!container) return
              const containerWidth = container.getBoundingClientRect().width
              const deltaX = moveEvent.clientX - startX
              const deltaPercent = (deltaX / containerWidth) * 100
              const newPercent = Math.min(Math.max(startPercent + deltaPercent, 30), 70)
              setSplitPercent(newPercent)
            }

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
            }

            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }}
        />

        {/* RIGHT PANE - Alerts for Selected Symbol */}
        <div className="flex flex-col overflow-hidden" style={{ width: `${100 - splitPercent}%`, background: 'var(--bg-glass-light)' }}>
          <div className="px-3 py-2 glass-header flex-shrink-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Alerts for {selectedSymbol || '—'}
              {selectedSymbol && <span className="text-xs text-gray-500 ml-2">({symbolAlerts.length}){dbAlertsLoading && ' loading...'}</span>}
            </h3>
          </div>
          <div className="px-2 pt-1 flex-shrink-0">
            <StockDataRibbon symbol={selectedSymbol} />
          </div>
          <div className="flex-1 overflow-auto">
            {selectedSymbol ? (
              symbolAlerts.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-800 text-xs text-gray-400">
                    <tr>
                      <th className="w-20 px-2 py-1 text-left">Time</th>
                      <th className="w-24 px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-left">Message</th>
                      <th className="w-16 px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {symbolAlerts.map((alert) => (
                      <tr key={alert.id} className="border-b border-gray-800 hover:bg-gray-700/50">
                        <td className="px-2 py-1 text-gray-400 font-mono text-xs">
                          {formatTime(alert.timestamp)}
                        </td>
                        <td className="px-2 py-1">
                          <span
                            className={clsx(
                              'text-xs px-1.5 py-0.5 rounded',
                              alert.type === 'price' && 'bg-green-900/50 text-green-400',
                              alert.type === 'filing' && 'bg-blue-900/50 text-blue-400',
                              alert.type === 'news' && 'bg-purple-900/50 text-purple-400',
                              alert.type === 'catalyst' && 'bg-orange-900/50 text-orange-400',
                              alert.type === 'trade_exchange' && 'bg-yellow-900/50 text-yellow-400',
                              alert.type === 'scanner' && 'bg-cyan-900/50 text-cyan-400',
                            )}
                          >
                            {alert.type}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-gray-300">
                          {alert.url ? (
                            <a href={alert.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{alert.message}</a>
                          ) : alert.message}
                        </td>
                        <td className="px-2 py-1 text-center whitespace-nowrap">
                          <button
                            onClick={() => navigator.clipboard.writeText((alert.message || '').replace(/^Catalyst PR\s*/i, ''))}
                            className="text-gray-500 hover:text-gray-300 text-xs mr-1"
                            title="Copy to clipboard"
                          >
                            📋
                          </button>
                          {shouldShowGrok(alert) && alert.url && (
                            <GrokButton
                              url={alert.url}
                              symbol={alert.symbol}
                              alertType={alert.type}
                              alertText={alert.message}
                              displayMode="modal"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No alerts for {selectedSymbol}
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                Select a flagged symbol to view alerts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
