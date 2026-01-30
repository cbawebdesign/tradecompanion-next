"use client"

import { useState, useCallback, useEffect, useRef } from 'react'
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

interface WatchlistProps {
  isPopout?: boolean
}

export function Watchlist({ isPopout = false }: WatchlistProps) {
  const {
    watchlists,
    selectedWatchlistId,
    setSelectedWatchlistId,
    selectedSymbol,
    setSelectedSymbol,
    quotes,
    addSymbolToWatchlist,
    removeSymbolFromWatchlist,
    updateSymbolInWatchlist,
    addWatchlist,
    removeWatchlist,
    flaggedSymbols,
    toggleFlag,
    alerts,
    config,
    activePane,
    setActivePane,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const isActive = activePane === 'watchlist'

  const [newSymbol, setNewSymbol] = useState('')
  const [newWatchlistName, setNewWatchlistName] = useState('')
  const [inlineAddSymbol, setInlineAddSymbol] = useState('')
  const [isAddingInline, setIsAddingInline] = useState(false)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const [splitPercent, setSplitPercent] = useState(config.watchlistSplitPercent || 60)

  // Default to first watchlist
  useEffect(() => {
    if (!selectedWatchlistId && watchlists.length > 0) {
      setSelectedWatchlistId(watchlists[0].id)
    }
  }, [selectedWatchlistId, watchlists, setSelectedWatchlistId])

  const currentWatchlist = watchlists.find(w => w.id === selectedWatchlistId)

  // Get alerts for the selected symbol
  const symbolAlerts = selectedSymbol
    ? alerts.filter(a => a.symbol === selectedSymbol)
    : []

  const handleAddSymbol = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!newSymbol.trim() || !selectedWatchlistId) return

    const symbol = newSymbol.toUpperCase().trim()

    // Check if already exists
    if (currentWatchlist?.symbols.some(s => s.symbol === symbol)) {
      return
    }

    addSymbolToWatchlist(selectedWatchlistId, {
      symbol,
      upperAlert: null,
      lowerAlert: null,
      notes: '',
    })
    setNewSymbol('')
  }, [newSymbol, selectedWatchlistId, currentWatchlist, addSymbolToWatchlist])

  const handleAddWatchlist = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!newWatchlistName.trim()) return
    addWatchlist(newWatchlistName.trim())
    setNewWatchlistName('')
  }, [newWatchlistName, addWatchlist])

  const handleInlineAdd = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inlineAddSymbol.trim() && selectedWatchlistId) {
      const symbol = inlineAddSymbol.toUpperCase().trim()

      // Check if already exists
      if (currentWatchlist?.symbols.some(s => s.symbol === symbol)) {
        setInlineAddSymbol('')
        setIsAddingInline(false)
        return
      }

      addSymbolToWatchlist(selectedWatchlistId, {
        symbol,
        upperAlert: null,
        lowerAlert: null,
        notes: '',
      })
      setInlineAddSymbol('')
      // Keep focus for adding more
    } else if (e.key === 'Escape') {
      setInlineAddSymbol('')
      setIsAddingInline(false)
    }
  }, [inlineAddSymbol, selectedWatchlistId, currentWatchlist, addSymbolToWatchlist])

  // Focus inline input when entering add mode
  useEffect(() => {
    if (isAddingInline && inlineInputRef.current) {
      inlineInputRef.current.focus()
    }
  }, [isAddingInline])

  const handleUpdateAlert = useCallback((symbol: string, field: 'upperAlert' | 'lowerAlert', value: string) => {
    if (!selectedWatchlistId) return
    const current = currentWatchlist?.symbols.find(s => s.symbol === symbol)
    if (!current) return

    updateSymbolInWatchlist(selectedWatchlistId, {
      ...current,
      [field]: value ? parseFloat(value) : null,
    })
  }, [selectedWatchlistId, currentWatchlist, updateSymbolInWatchlist])

  // Handle click to set focus
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        setActivePane('watchlist')
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [setActivePane])

  // Keyboard navigation - only when this pane is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard when this pane is focused
      if (!isActive) return
      if (!currentWatchlist) return

      const symbols = currentWatchlist.symbols
      const currentIndex = symbols.findIndex(s => s.symbol === selectedSymbol)

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const nextIndex = currentIndex < symbols.length - 1 ? currentIndex + 1 : 0
        setSelectedSymbol(symbols[nextIndex]?.symbol || null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : symbols.length - 1
        setSelectedSymbol(symbols[prevIndex]?.symbol || null)
      } else if (e.key === ' ' && selectedSymbol) {
        e.preventDefault()
        toggleFlag(selectedSymbol)
      } else if (e.key === 'Delete' && selectedSymbol) {
        e.preventDefault()
        removeSymbolFromWatchlist(selectedWatchlistId!, selectedSymbol)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, currentWatchlist, selectedSymbol, selectedWatchlistId, setSelectedSymbol, toggleFlag, removeSymbolFromWatchlist])

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
      {/* Top Controls */}
      <div className="p-2 bg-gray-800 border-b border-gray-700 flex items-center gap-4 flex-shrink-0">
        {/* Watchlist Selector */}
        <div className="flex items-center gap-1">
          <select
            value={selectedWatchlistId || ''}
            onChange={(e) => setSelectedWatchlistId(e.target.value)}
            className="text-sm py-1 px-2 bg-gray-700 border border-gray-600 rounded"
          >
            {watchlists.map((wl) => (
              <option key={wl.id} value={wl.id}>{wl.name}</option>
            ))}
          </select>
          {watchlists.length > 1 && selectedWatchlistId && (
            <button
              onClick={() => {
                if (confirm(`Delete watchlist "${currentWatchlist?.name}"?`)) {
                  const currentIndex = watchlists.findIndex(w => w.id === selectedWatchlistId)
                  removeWatchlist(selectedWatchlistId)
                  // Select another watchlist
                  const nextWatchlist = watchlists[currentIndex === 0 ? 1 : currentIndex - 1]
                  if (nextWatchlist) {
                    setSelectedWatchlistId(nextWatchlist.id)
                  }
                }
              }}
              className="text-gray-400 hover:text-red-400 p-1"
              title="Delete watchlist"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>

        {/* New Watchlist */}
        <form onSubmit={handleAddWatchlist} className="flex gap-1">
          <input
            type="text"
            value={newWatchlistName}
            onChange={(e) => setNewWatchlistName(e.target.value)}
            placeholder="New watchlist..."
            className="text-xs py-1 px-2 w-28"
          />
          <button type="submit" className="btn btn-primary text-xs py-1 px-2">New</button>
        </form>

        {/* Add Symbol */}
        <form onSubmit={handleAddSymbol} className="flex gap-1 ml-auto">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="Add symbol..."
            className="text-sm py-1 px-2 w-24"
          />
          <button type="submit" className="btn btn-primary text-sm py-1 px-2">Add</button>
        </form>
        {!isPopout && (
          <PopOutButton route="/pop/watchlist" title="Watchlist" width={1000} height={600} />
        )}
      </div>

      {/* Main Content - LEFT/RIGHT Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANE - Watchlist Table */}
        <div className="flex flex-col overflow-hidden" style={{ width: `${splitPercent}%` }}>
          <div className="flex-1 overflow-auto table-container">
            <table>
              <thead>
                <tr>
                  <th className="w-8">Flag</th>
                  <th>Symbol</th>
                  <th className="text-right">Last</th>
                  <th className="text-right">Bid</th>
                  <th className="text-right">Ask</th>
                  <th className="text-right">% Chg</th>
                  <th className="text-right">Upper</th>
                  <th className="text-right">Lower</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {currentWatchlist?.symbols.map((item) => {
                  const quote = quotes[item.symbol]
                  const isFlagged = flaggedSymbols.has(item.symbol)
                  const changeClass = quote?.change > 0 ? 'price-up' : quote?.change < 0 ? 'price-down' : 'price-neutral'

                  return (
                    <tr
                      key={item.symbol}
                      onClick={() => setSelectedSymbol(item.symbol)}
                      className={clsx(
                        'cursor-pointer',
                        selectedSymbol === item.symbol && 'selected'
                      )}
                    >
                      <td className="text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFlag(item.symbol)
                          }}
                          className={clsx(
                            'text-lg',
                            isFlagged ? 'text-yellow-400' : 'text-gray-600'
                          )}
                        >
                          {isFlagged ? '⚑' : '⚐'}
                        </button>
                      </td>
                      <td className="font-mono font-semibold">{item.symbol}</td>
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
                        <input
                          type="number"
                          step="0.01"
                          value={item.upperAlert || ''}
                          onChange={(e) => handleUpdateAlert(item.symbol, 'upperAlert', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-16 text-right text-xs py-0.5"
                          placeholder="-"
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={item.lowerAlert || ''}
                          onChange={(e) => handleUpdateAlert(item.symbol, 'lowerAlert', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-16 text-right text-xs py-0.5"
                          placeholder="-"
                        />
                      </td>
                      <td>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (selectedWatchlistId) {
                              removeSymbolFromWatchlist(selectedWatchlistId, item.symbol)
                            }
                          }}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {/* Empty row for adding new symbol */}
                <tr className="border-t border-gray-700/50">
                  <td className="text-center text-gray-600">⚐</td>
                  <td>
                    {isAddingInline ? (
                      <input
                        ref={inlineInputRef}
                        type="text"
                        value={inlineAddSymbol}
                        onChange={(e) => setInlineAddSymbol(e.target.value.toUpperCase())}
                        onKeyDown={handleInlineAdd}
                        onBlur={() => {
                          if (!inlineAddSymbol.trim()) {
                            setIsAddingInline(false)
                          }
                        }}
                        placeholder="SYMBOL"
                        className="w-20 bg-transparent border-none outline-none text-sm py-1 font-mono"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => setIsAddingInline(true)}
                        className="text-gray-500 hover:text-gray-300 text-sm py-1 font-mono"
                      >
                        +
                      </button>
                    )}
                  </td>
                  <td colSpan={7} className="text-gray-600 text-xs">
                    {isAddingInline && 'Press Enter to add, Esc to cancel'}
                  </td>
                </tr>
              </tbody>
            </table>
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
              const newPercent = Math.min(Math.max(startPercent + deltaPercent, 30), 80)
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
                Select a symbol to view alerts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
