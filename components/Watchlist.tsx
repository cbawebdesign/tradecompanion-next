"use client"

import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import type { WatchlistSymbol } from '@/types'

export function Watchlist() {
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
    flaggedSymbols,
    toggleFlag,
  } = useStore()

  const [newSymbol, setNewSymbol] = useState('')
  const [newWatchlistName, setNewWatchlistName] = useState('')
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null)

  // Default to first watchlist
  useEffect(() => {
    if (!selectedWatchlistId && watchlists.length > 0) {
      setSelectedWatchlistId(watchlists[0].id)
    }
  }, [selectedWatchlistId, watchlists, setSelectedWatchlistId])

  const currentWatchlist = watchlists.find(w => w.id === selectedWatchlistId)

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

  const handleUpdateAlert = useCallback((symbol: string, field: 'upperAlert' | 'lowerAlert', value: string) => {
    if (!selectedWatchlistId) return
    const current = currentWatchlist?.symbols.find(s => s.symbol === symbol)
    if (!current) return

    updateSymbolInWatchlist(selectedWatchlistId, {
      ...current,
      [field]: value ? parseFloat(value) : null,
    })
  }, [selectedWatchlistId, currentWatchlist, updateSymbolInWatchlist])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [currentWatchlist, selectedSymbol, selectedWatchlistId, setSelectedSymbol, toggleFlag, removeSymbolFromWatchlist])

  return (
    <div className="flex h-full">
      {/* Watchlist Selector Sidebar */}
      <div className="w-48 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-2 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Watchlists</h3>
          <form onSubmit={handleAddWatchlist} className="flex gap-1">
            <input
              type="text"
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="New list..."
              className="flex-1 text-xs py-1 px-2"
            />
            <button type="submit" className="btn btn-primary text-xs py-1 px-2">+</button>
          </form>
        </div>
        <div className="flex-1 overflow-y-auto">
          {watchlists.map((wl) => (
            <button
              key={wl.id}
              onClick={() => setSelectedWatchlistId(wl.id)}
              className={clsx(
                'w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors',
                selectedWatchlistId === wl.id && 'bg-blue-900/30 text-blue-400'
              )}
            >
              {wl.name}
              <span className="text-xs text-gray-500 ml-2">({wl.symbols.length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Watchlist Table */}
      <div className="flex-1 flex flex-col">
        {/* Add Symbol Form */}
        <div className="p-2 bg-gray-800 border-b border-gray-700">
          <form onSubmit={handleAddSymbol} className="flex gap-2">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="Add symbol..."
              className="w-32 text-sm"
            />
            <button type="submit" className="btn btn-primary text-sm">Add</button>
          </form>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto table-container">
          <table>
            <thead>
              <tr>
                <th className="w-8">Flag</th>
                <th>Symbol</th>
                <th className="text-right">Last</th>
                <th className="text-right">Bid</th>
                <th className="text-right">Ask</th>
                <th className="text-right">Change</th>
                <th className="text-right">Volume</th>
                <th className="text-right">Lower Alert</th>
                <th className="text-right">Upper Alert</th>
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
                      {quote?.change ? `${quote.change > 0 ? '+' : ''}${quote.change.toFixed(2)}` : '-'}
                      {quote?.changePercent ? ` (${quote.changePercent.toFixed(1)}%)` : ''}
                    </td>
                    <td className="text-right font-mono text-gray-400">
                      {quote?.volume?.toLocaleString() || '-'}
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={item.lowerAlert || ''}
                        onChange={(e) => handleUpdateAlert(item.symbol, 'lowerAlert', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-20 text-right text-xs py-0.5"
                        placeholder="-"
                      />
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={item.upperAlert || ''}
                        onChange={(e) => handleUpdateAlert(item.symbol, 'upperAlert', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-20 text-right text-xs py-0.5"
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
              {(!currentWatchlist || currentWatchlist.symbols.length === 0) && (
                <tr>
                  <td colSpan={10} className="text-center text-gray-500 py-8">
                    No symbols in this watchlist. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
