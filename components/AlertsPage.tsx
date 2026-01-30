"use client"

import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { GrokButton } from './GrokButton'
import { PopOutButton } from './PopOutButton'
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
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const isActive = activePane === 'alerts'

  const [splitPercent, setSplitPercent] = useState(50)

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

  // Get alerts for selected symbol
  const symbolAlerts = selectedSymbol
    ? alerts.filter(a => a.symbol === selectedSymbol)
    : []

  const formatTime = (date: Date) => {
    const d = new Date(date)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        'flex flex-col h-full border-2 transition-colors',
        isActive ? 'border-blue-500' : 'border-transparent'
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">Flagged Symbols</h3>
          <p className="text-xs text-gray-500">{flaggedList.length} flagged</p>
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
          className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0"
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
        <div className="flex flex-col bg-gray-800/50 overflow-hidden" style={{ width: `${100 - splitPercent}%` }}>
          <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-400">
              Alerts for {selectedSymbol || '—'}
              {selectedSymbol && <span className="text-xs text-gray-500 ml-2">({symbolAlerts.length})</span>}
            </h3>
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
                      <th className="w-8 px-2 py-1">AI</th>
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
                        <td className="px-2 py-1 text-gray-300">{alert.message}</td>
                        <td className="px-2 py-1 text-center">
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
