"use client"

import { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { proxyUrl } from '@/lib/proxyUrl'
import { fireAhk } from '@/lib/ahk'
import { copyToClipboard } from '@/lib/clipboard'
import { GrokButton } from './GrokButton'
import { GrokStockButton } from './GrokStockButton'
import { PopOutButton } from './PopOutButton'
import { StockDataRibbon } from './StockDataRibbon'
import { WatchlistSubscriptionsModal } from './WatchlistSubscriptionsModal'
import type { Alert } from '@/types'

// Check if alert should show Grok button (filings/PRs with URL)
const shouldShowGrok = (alert: Alert): boolean => {
  if (!alert.url) return false
  const type = alert.type.toLowerCase()
  return type === 'filing' || type.includes('pr') || type.includes('filing')
}

// Module-level cache for AlertsBySymbol results — survives remounts
const dbAlertsCache: Record<string, Alert[]> = {}

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
    updateConfig,
    activePane,
    setActivePane,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const isActive = activePane === 'watchlist'

  const [sortCol, setSortCol] = useState<'symbol' | 'change' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [newSymbol, setNewSymbol] = useState('')
  const [newWatchlistName, setNewWatchlistName] = useState('')
  const [inlineAddSymbol, setInlineAddSymbol] = useState('')
  const [isAddingInline, setIsAddingInline] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; symbol: string } | null>(null)
  const [subscriptionsModalFor, setSubscriptionsModalFor] = useState<string | null>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  // Split percent is sourced from config so the Flagged Symbols view (AlertsPage)
  // shares the same divider position. Dragging here persists + syncs both views.
  const splitPercent = config.watchlistSplitPercent ?? 60
  const setSplitPercent = (n: number) => updateConfig({ watchlistSplitPercent: n })

  // Auto-select first watchlist if selectedWatchlistId is stale or missing
  useEffect(() => {
    if (watchlists.length > 0 && !watchlists.find(w => w.id === selectedWatchlistId)) {
      console.log('Watchlist: auto-selecting first watchlist (stale ID)')
      setSelectedWatchlistId(watchlists[0].id)
    }
  }, [selectedWatchlistId, watchlists, setSelectedWatchlistId])

  const currentWatchlist = watchlists.find(w => w.id === selectedWatchlistId) || watchlists[0]

  // When the user switches watchlists, the previously-selected symbol may not
  // be on the new list — leaving the data ribbon, AHK target, and "selected"
  // row in a stale state. Justin: "the row that is selected should be the
  // first symbol on this list." Reset to the first symbol of the new list
  // (or null if the new list is empty).
  useEffect(() => {
    if (!currentWatchlist) return
    const onCurrent = selectedSymbol
      && currentWatchlist.symbols.some(s => s.symbol === selectedSymbol)
    if (!onCurrent) {
      setSelectedSymbol(currentWatchlist.symbols[0]?.symbol || null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWatchlistId])

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

    // Show cached data instantly if available
    const cached = dbAlertsCache[selectedSymbol.toUpperCase()]
    if (cached) {
      setDbAlerts(cached)
      setDbAlertsSymbol(selectedSymbol)
      setDbAlertsLoading(false)
    } else {
      setDbAlertsLoading(true)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const uk = config.userKey
    // Capture which symbol this fetch is for — the user may flip away before
    // the response lands, in which case we must NOT overwrite state for the
    // symbol they're now viewing.
    const fetchedFor = selectedSymbol
    let aborted = false

    fetch(proxyUrl(
      `${baseUrl}/api/AlertsBySymbol?symbol=${encodeURIComponent(selectedSymbol)}`
      + (uk ? `&userKey=${encodeURIComponent(uk)}` : '')
    ), { signal: controller.signal })
      .then(r => {
        clearTimeout(timeoutId)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        const mapped: Alert[] = []
        data.tweets?.forEach((t: any) => {
          // Build tweet URL from source (username) — AlertsBySymbol returns source=username
          const tweetUrl = t.id_long ? `https://x.com/${t.source}/status/${t.id_long}` : undefined
          mapped.push({ id: `db-tweet-${t.time}-${t.source}`, symbol: fetchedFor, message: `@${t.source}: ${t.text}`, type: 'tweet', color: '#1da1f2', timestamp: new Date(t.time), read: false, url: tweetUrl })
        })
        data.filings?.forEach((f: any) => {
          mapped.push({ id: `db-filing-${f.time}-${f.source}`, symbol: fetchedFor, message: f.text, type: 'filing', color: '#00bcd4', timestamp: new Date(f.time), read: false, url: f.url })
        })
        data.tradeExchange?.forEach((tx: any) => {
          mapped.push({ id: `db-tx-${tx.time}-${tx.source}`, symbol: fetchedFor, message: `[${tx.source}] ${tx.text}`, type: 'trade_exchange', color: '#eab308', timestamp: new Date(tx.time), read: false })
        })
        data.tradingView?.forEach((tv: any) => {
          mapped.push({ id: `db-tv-${tv.time}`, symbol: fetchedFor, message: tv.text, type: 'tradingview', color: '#4caf50', timestamp: new Date(tv.time), read: false })
        })
        data.catalysts?.forEach((c: any) => {
          const catUrl = c.resource_id ? `/api/pr?id=${c.resource_id}` : undefined
          mapped.push({ id: `db-cat-${c.time}-${c.symbol}`, symbol: fetchedFor, message: c.text, type: 'catalyst', color: '#9c27b0', timestamp: new Date(c.time), read: false, url: catUrl })
        })
        // Cache regardless of whether the user is still on this symbol — a
        // future selection of the same symbol will use it.
        dbAlertsCache[fetchedFor.toUpperCase()] = mapped
        // Only swap visible state if the user hasn't moved to another symbol.
        if (!aborted && useStore.getState().selectedSymbol === fetchedFor) {
          setDbAlerts(mapped)
          setDbAlertsSymbol(fetchedFor)
        }
      })
      .catch(() => { /* swallow — abort or network */ })
      .finally(() => {
        // Always clear loading. Previously AbortError silently kept it true,
        // so flipping symbols while a fetch was in flight stuck the ribbon
        // on "Loading..." forever.
        if (useStore.getState().selectedSymbol === fetchedFor) {
          setDbAlertsLoading(false)
        }
      })

    return () => {
      aborted = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [selectedSymbol, config.hubUrl, config.userKey])

  // Get alerts for the selected symbol — merge live + DB
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

  const handleAddSymbol = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const wlId = selectedWatchlistId || currentWatchlist?.id
    if (!newSymbol.trim() || !wlId) return

    const symbol = newSymbol.toUpperCase().trim()

    // Check if already exists
    if (currentWatchlist?.symbols.some(s => s.symbol === symbol)) {
      return
    }

    addSymbolToWatchlist(wlId, {
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
    const wlId = selectedWatchlistId || currentWatchlist?.id
    if (e.key === 'Enter' && inlineAddSymbol.trim() && wlId) {
      const symbol = inlineAddSymbol.toUpperCase().trim()

      // Check if already exists
      if (currentWatchlist?.symbols.some(s => s.symbol === symbol)) {
        setInlineAddSymbol('')
        setIsAddingInline(false)
        return
      }

      addSymbolToWatchlist(wlId, {
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

      // Skip keys when focus is in an input/textarea/select/contentEditable
      const tag = (e.target as HTMLElement)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable
      if (inInput && e.key !== 'Escape') return

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
      } else if (e.key === 'ArrowLeft') {
        // Switch to previous watchlist tab
        const wlIndex = watchlists.findIndex(w => w.id === selectedWatchlistId)
        if (wlIndex > 0) {
          e.preventDefault()
          setSelectedWatchlistId(watchlists[wlIndex - 1].id)
        }
      } else if (e.key === 'ArrowRight') {
        // Switch to next watchlist tab
        const wlIndex = watchlists.findIndex(w => w.id === selectedWatchlistId)
        if (wlIndex < watchlists.length - 1) {
          e.preventDefault()
          setSelectedWatchlistId(watchlists[wlIndex + 1].id)
        }
      } else if (e.key === ' ' && selectedSymbol) {
        // Spacebar fires AHK + copies the symbol. Used to also toggle the flag,
        // but Justin saw the same surprise-flag bug as in the timeline — pressing
        // space to fire AHK shouldn't flip the flag state.
        e.preventDefault()
        copyToClipboard(selectedSymbol)
        if (config.ahkEnabled && config.ahkUrl) {
          fireAhk(selectedSymbol, config.ahkUrl)
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSymbol) {
        e.preventDefault()
        removeSymbolFromWatchlist(selectedWatchlistId!, selectedSymbol)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, currentWatchlist, selectedSymbol, selectedWatchlistId, watchlists, setSelectedSymbol, setSelectedWatchlistId, toggleFlag, removeSymbolFromWatchlist])

  // Close context menu on click-away or Escape
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', handleEsc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [contextMenu])

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, symbol: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, symbol })
  }, [])

  const handleMoveToWatchlist = useCallback((symbol: string, targetWatchlistId: string) => {
    if (!selectedWatchlistId) return
    const current = currentWatchlist?.symbols.find(s => s.symbol === symbol)
    if (!current) return
    removeSymbolFromWatchlist(selectedWatchlistId, symbol)
    addSymbolToWatchlist(targetWatchlistId, { ...current })
    setContextMenu(null)
  }, [selectedWatchlistId, currentWatchlist, removeSymbolFromWatchlist, addSymbolToWatchlist])

  const handleCopyToWatchlist = useCallback((symbol: string, targetWatchlistId: string) => {
    const current = currentWatchlist?.symbols.find(s => s.symbol === symbol)
    if (!current) return
    addSymbolToWatchlist(targetWatchlistId, { ...current })
    setContextMenu(null)
  }, [currentWatchlist, addSymbolToWatchlist])

  // Sort toggle handler
  const handleSort = useCallback((col: 'symbol' | 'change') => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'change' ? 'desc' : 'asc')
    }
  }, [sortCol])

  // Smart price formatting: 4 decimals if < $1, otherwise 2
  const formatPrice = (val: number | undefined) => {
    if (!val) return '-'
    return val < 1 ? val.toFixed(4) : val.toFixed(2)
  }

  // Get sorted symbols
  const getSortedSymbols = () => {
    if (!currentWatchlist) return []
    const syms = [...currentWatchlist.symbols]
    if (!sortCol) return syms
    return syms.sort((a, b) => {
      let cmp = 0
      if (sortCol === 'symbol') {
        cmp = a.symbol.localeCompare(b.symbol)
      } else if (sortCol === 'change') {
        const aChg = quotes[a.symbol]?.changePercent || 0
        const bChg = quotes[b.symbol]?.changePercent || 0
        cmp = aChg - bChg
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
  }

  const sortArrow = (col: 'symbol' | 'change') => {
    if (sortCol !== col) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

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
      {/* Top Controls */}
      <div className="p-2 glass-header rounded-t-lg flex items-center gap-4 flex-shrink-0">
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
          {selectedWatchlistId && (
            <button
              onClick={() => setSubscriptionsModalFor(selectedWatchlistId)}
              className="text-gray-400 hover:text-blue-400 p-1"
              title="Edit alert subscriptions for this watchlist"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
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
                  <th className="cursor-pointer select-none" onClick={() => handleSort('symbol')}>Symbol{sortArrow('symbol')}</th>
                  <th className="text-right">Last</th>
                  <th className="text-right">Bid</th>
                  <th className="text-right">Ask</th>
                  <th className="text-right cursor-pointer select-none" onClick={() => handleSort('change')}>% Chg{sortArrow('change')}</th>
                  <th className="text-right">Upper</th>
                  <th className="text-right">Lower</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {getSortedSymbols().map((item) => {
                  const quote = quotes[item.symbol]
                  const isFlagged = flaggedSymbols.has(item.symbol)
                  const changeClass = quote?.change > 0 ? 'price-up' : quote?.change < 0 ? 'price-down' : 'price-neutral'

                  return (
                    <tr
                      key={item.symbol}
                      onClick={() => {
                        setSelectedSymbol(item.symbol)
                        if (config.ahkEnabled && config.ahkUrl) {
                          fireAhk(item.symbol, config.ahkUrl)
                        }
                      }}
                      onContextMenu={(e) => handleContextMenu(e, item.symbol)}
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
                      <td className="font-mono font-semibold">
                        <div className="flex items-center gap-1">
                          <span>{item.symbol}</span>
                          <GrokStockButton symbol={item.symbol} />
                        </div>
                      </td>
                      <td className={clsx('text-right font-mono', changeClass)}>
                        {formatPrice(quote?.last)}
                      </td>
                      <td className="text-right font-mono text-gray-400">
                        {formatPrice(quote?.bid)}
                      </td>
                      <td className="text-right font-mono text-gray-400">
                        {formatPrice(quote?.ask)}
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
                            onClick={() => copyToClipboard((alert.message || '').replace(/^Catalyst PR\s*/i, ''))}
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
                Select a symbol to view alerts
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] py-1 rounded shadow-lg border"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-panel, #1a1a2e)',
            borderColor: 'var(--border-glass, #333)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b" style={{ borderColor: 'var(--border-glass, #333)' }}>
            {contextMenu.symbol}
          </div>
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 text-red-400"
            onClick={() => {
              if (selectedWatchlistId) removeSymbolFromWatchlist(selectedWatchlistId, contextMenu.symbol)
              setContextMenu(null)
            }}
          >
            Remove
          </button>
          {watchlists.filter(w => w.id !== selectedWatchlistId).length > 0 && (
            <>
              <div className="h-px my-0.5" style={{ background: 'var(--border-glass, #333)' }} />
              <div className="px-3 py-1 text-xs text-gray-500">Move to...</div>
              {watchlists.filter(w => w.id !== selectedWatchlistId).map(wl => (
                <button
                  key={`move-${wl.id}`}
                  className="w-full text-left px-5 py-1 text-sm hover:bg-white/10 text-gray-300"
                  onClick={() => handleMoveToWatchlist(contextMenu.symbol, wl.id)}
                >
                  {wl.name}
                </button>
              ))}
              <div className="h-px my-0.5" style={{ background: 'var(--border-glass, #333)' }} />
              <div className="px-3 py-1 text-xs text-gray-500">Copy to...</div>
              {watchlists.filter(w => w.id !== selectedWatchlistId).map(wl => (
                <button
                  key={`copy-${wl.id}`}
                  className="w-full text-left px-5 py-1 text-sm hover:bg-white/10 text-gray-300"
                  onClick={() => handleCopyToWatchlist(contextMenu.symbol, wl.id)}
                >
                  {wl.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {subscriptionsModalFor && (
        <WatchlistSubscriptionsModal
          watchlistId={subscriptionsModalFor}
          onClose={() => setSubscriptionsModalFor(null)}
        />
      )}
    </div>
  )
}
