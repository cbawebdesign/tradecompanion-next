"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { GrokButton } from './GrokButton'
import { PopOutButton } from './PopOutButton'
import { StockDataRibbon } from './StockDataRibbon'
import { SymbolContextMenu } from './SymbolContextMenu'
import { ResizableTh } from './ResizableTh'
import { PriceAlertInput } from './PriceAlertInput'
import { fireAhk } from '@/lib/ahk'
import { prevMarketCloseISO } from '@/lib/marketCalendar'
import { normalizeAlertMessage } from '@/lib/alertDedup'
import { copyToClipboard } from '@/lib/clipboard'
import type { Alert } from '@/types'

// Check if alert should show Grok button (filings/PRs with URL)
const shouldShowGrok = (alert: Alert): boolean => {
  if (!alert.url) return false
  const type = alert.type.toLowerCase()
  return type === 'filing' || type.includes('pr') || type.includes('filing')
}

// Module-level cache for AlertsBySymbol results — survives remounts
const dbAlertsCache: Record<string, Alert[]> = {}

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
    updateConfig,
    watchlists,
    updateSymbolInWatchlist,
    triggeredPriceAlerts,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const isActive = activePane === 'alerts'

  // Flagged List split is now independent of the Watchlist split — Justin
  // wants the two views sized separately. Falls back to the legacy shared
  // value once, then writes to its own field on first drag.
  const splitPercent = config.flaggedListSplitPercent ?? config.watchlistSplitPercent ?? 50
  const setSplitPercent = (n: number) => updateConfig({ flaggedListSplitPercent: n })
  const [addSymbolInput, setAddSymbolInput] = useState('')

  // Column sort for the Flagged Symbols table is persisted to config so it
  // survives navigation. null = insertion order. Third click clears.
  type FlaggedSortCol = 'symbol' | 'last' | 'changePercent' | null
  const flaggedSortCol = (config.flaggedSort?.col ?? null) as FlaggedSortCol
  const flaggedSortDir = config.flaggedSort?.dir ?? 'asc'
  const cycleFlaggedSort = (col: 'symbol' | 'last' | 'changePercent') => {
    if (flaggedSortCol !== col) { updateConfig({ flaggedSort: { col, dir: 'asc' } }); return }
    if (flaggedSortDir === 'asc') { updateConfig({ flaggedSort: { col, dir: 'desc' } }); return }
    updateConfig({ flaggedSort: { col: null, dir: 'asc' } }) // third click clears
  }
  const sortIndicator = (col: FlaggedSortCol) =>
    flaggedSortCol === col ? (flaggedSortDir === 'asc' ? ' ▲' : ' ▼') : ''

  // Column widths persisted per-key for the Flagged List table.
  const setFlaggedColWidth = (key: string, px: number) =>
    updateConfig({ flaggedColumnWidths: { ...(config.flaggedColumnWidths || {}), [key]: px } })

  // For Flagged List price-alert inputs: find the watchlist + symbol entry
  // a flagged symbol belongs to. Picks the first match in the user's saved
  // Settings order. Returns null when the symbol isn't on any list.
  const orderedWatchlistsForLookup = (() => {
    const order = config.watchlistOrder
    if (!order || order.length === 0) return watchlists
    const byId = new Map(watchlists.map((w) => [w.id, w]))
    const out: typeof watchlists = []
    for (const id of order) {
      const w = byId.get(id)
      if (w) { out.push(w); byId.delete(id) }
    }
    Array.from(byId.values()).forEach((w) => out.push(w))
    return out
  })()
  const findEntry = (symbol: string) => {
    for (const wl of orderedWatchlistsForLookup) {
      const entry = wl.symbols.find((s) => s.symbol === symbol)
      if (entry) return { wl, entry }
    }
    return null
  }
  const updateAlertForFlagged = (symbol: string, field: 'upperAlert' | 'lowerAlert', value: number | null) => {
    const hit = findEntry(symbol)
    if (!hit) return
    updateSymbolInWatchlist(hit.wl.id, { ...hit.entry, [field]: value })
  }

  // Right-click context menu on Flagged List rows.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; symbol: string } | null>(null)
  const handleContextMenu = useCallback((e: React.MouseEvent, symbol: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, symbol })
  }, [])

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

      // Don't intercept keys when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable
      if (isEditable && e.key !== 'Escape') return

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

  // Convert flagged symbols to array with quote data, then optionally sort.
  // Symbols without a quote sort to the bottom for numeric columns so the
  // table doesn't fragment on partial data.
  const flaggedList = (() => {
    const rows = Array.from(flaggedSymbols).map(symbol => ({
      symbol,
      quote: quotes[symbol],
      alertCount: alerts.filter(a => a.symbol === symbol).length,
    }))
    if (!flaggedSortCol) return rows
    const dir = flaggedSortDir === 'asc' ? 1 : -1
    return rows.slice().sort((a, b) => {
      if (flaggedSortCol === 'symbol') return a.symbol.localeCompare(b.symbol) * dir
      const av = flaggedSortCol === 'last' ? a.quote?.last : a.quote?.changePercent
      const bv = flaggedSortCol === 'last' ? b.quote?.last : b.quote?.changePercent
      const aMissing = av === undefined || av === null || isNaN(av)
      const bMissing = bv === undefined || bv === null || isNaN(bv)
      if (aMissing && bMissing) return 0
      if (aMissing) return 1
      if (bMissing) return -1
      return (av - bv) * dir
    })
  })()

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
    // Capture the symbol this fetch is for — the user may flip away before
    // we get a response, in which case we mustn't stomp on the new symbol's
    // state.
    const fetchedFor = selectedSymbol
    let aborted = false

    // Drill-down view is unfiltered: Justin wants to see every filing for a
    // selected symbol (including Form 4 etc. that he's globally excluded from
    // the timeline). Dropping userKey makes the server skip ExcludeFilings.
    // Force since=prev market close so after-close PRs/filings from the
    // prior trading day still show up — server default is midnight ET today.
    const since = encodeURIComponent(prevMarketCloseISO())
    fetch(
      `${config.hubUrl}/AlertsBySymbol?symbol=${encodeURIComponent(selectedSymbol)}&since=${since}`,
      { signal: controller.signal }
    )
      .then(r => {
        clearTimeout(timeoutId)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        const mapped: Alert[] = []
        data.tweets?.forEach((t: any) => {
          const tweetUrl = t.id_long && t.source
            ? `https://x.com/${t.source}/status/${t.id_long}`
            : undefined
          mapped.push({
            id: `db-tweet-${t.time}-${t.source}`,
            symbol: fetchedFor,
            message: `@${t.source}: ${t.text}`,
            type: 'tweet', color: '',
            timestamp: new Date(t.time), read: false,
            url: tweetUrl,
          })
        })
        data.filings?.forEach((f: any) => {
          mapped.push({ id: `db-filing-${f.time}-${f.source}`, symbol: fetchedFor, message: f.text, type: 'filing', color: '', timestamp: new Date(f.time), read: false, url: f.url })
        })
        data.tradeExchange?.forEach((tx: any) => {
          mapped.push({ id: `db-tx-${tx.time}-${tx.source}`, symbol: fetchedFor, message: tx.text, type: 'trade_exchange', color: '', timestamp: new Date(tx.time), read: false })
        })
        data.tradingView?.forEach((tv: any) => {
          mapped.push({ id: `db-tv-${tv.time}`, symbol: fetchedFor, message: tv.text, type: 'tradingview', color: '', timestamp: new Date(tv.time), read: false })
        })
        data.catalysts?.forEach((c: any) => {
          const catUrl = c.resource_id ? `/api/pr?id=${encodeURIComponent(c.resource_id)}` : undefined
          mapped.push({
            id: `db-cat-${c.time}-${c.symbol}`,
            symbol: fetchedFor,
            message: c.text,
            type: 'catalyst', color: '',
            timestamp: new Date(c.time), read: false,
            url: catUrl,
          })
        })
        dbAlertsCache[fetchedFor.toUpperCase()] = mapped
        if (!aborted && useStore.getState().selectedSymbol === fetchedFor) {
          setDbAlerts(mapped)
          setDbAlertsSymbol(fetchedFor)
        }
      })
      .catch(() => { /* swallow — abort or network */ })
      .finally(() => {
        // Always clear loading. AbortError used to silently leave it true,
        // sticking the ribbon on "Loading..." across symbol changes.
        if (useStore.getState().selectedSymbol === fetchedFor) {
          setDbAlertsLoading(false)
        }
      })

    return () => {
      aborted = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [selectedSymbol, config.hubUrl])

  // Merge live + DB alerts. Dedup uses normalized message + minute-resolution
  // timestamp so TX prefix variants and catalyst price suffixes collapse to a
  // single entry across live (SignalR) and DB (poll) sources.
  const liveAlerts = selectedSymbol ? alerts.filter(a => a.symbol === selectedSymbol) : []
  const mergedDbAlerts = dbAlertsSymbol === selectedSymbol ? dbAlerts : []
  // Per-symbol dedup: same symbol + same normalized message collapses to one
  // row regardless of type or timestamp.
  //
  // Justin (5/21): hide catalyst-confirmer alerts in this view because
  // they're a duplicate of the underlying PR (the same headline, but later,
  // with a `($price)` suffix). Always-newer = always wins dedup, hiding
  // the actual PR.
  //
  // Safety net: if a catalyst is the ONLY signal for this symbol (no
  // underlying PR / TX / filing in our DB), show it. Otherwise the user
  // sees nothing despite a real event having happened.
  const symbolAlertsMerged = [...liveAlerts, ...mergedDbAlerts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const nonCatalystMessages = new Set(
    symbolAlertsMerged.filter(a => a.type !== 'catalyst').map(a => normalizeAlertMessage(a.message))
  )
  const seenKeys = new Set<string>()
  const symbolAlerts = symbolAlertsMerged
    .filter(a => a.type !== 'catalyst' || !nonCatalystMessages.has(normalizeAlertMessage(a.message)))
    .filter(a => {
      const key = `${a.symbol}|${normalizeAlertMessage(a.message)}`
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
          {/* Settings/wrench removed per Justin — alert config now lives on the
              per-watchlist gear icon, this one was a duplicate path that caused
              confusion about where toggles were managed. */}
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

      {/* Flagged Symbols Header */}
      <div className="px-3 py-2 flex-shrink-0" style={{ background: 'var(--bg-glass-light)', borderBottom: '1px solid var(--border-glass)' }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Flagged Symbols</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{flaggedList.length} flagged</p>
          </div>
          {/* Add Symbol — directly flag without leaving the Alerts page */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const sym = addSymbolInput.trim().toUpperCase()
              if (!sym) return
              if (!flaggedSymbols.has(sym)) toggleFlag(sym)
              setAddSymbolInput('')
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              value={addSymbolInput}
              onChange={(e) => setAddSymbolInput(e.target.value)}
              placeholder="Add symbol..."
              maxLength={6}
              className="text-xs font-mono uppercase"
              style={{ width: '110px', padding: '4px 8px' }}
            />
            <button
              type="submit"
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--accent-primary)', color: 'white' }}
              title="Add to Flagged"
            >
              + Flag
            </button>
          </form>
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
              <table className="table-resizable">
                <thead>
                  <tr>
                    <th style={{ width: 32, minWidth: 32 }}>Flag</th>
                    <ResizableTh
                      columnKey="symbol"
                      widths={config.flaggedColumnWidths}
                      setWidth={setFlaggedColWidth}
                      defaultWidth={90}
                      className="cursor-pointer select-none"
                      title="Sort by Symbol"
                      onClick={() => cycleFlaggedSort('symbol')}
                    >
                      Symbol{sortIndicator('symbol')}
                    </ResizableTh>
                    <ResizableTh
                      columnKey="last"
                      widths={config.flaggedColumnWidths}
                      setWidth={setFlaggedColWidth}
                      defaultWidth={80}
                      className="text-right cursor-pointer select-none"
                      title="Sort by Last"
                      onClick={() => cycleFlaggedSort('last')}
                    >
                      Last{sortIndicator('last')}
                    </ResizableTh>
                    {/* Bid / Ask removed per Justin — saving server quote
                        bandwidth (Batch C) tracks the matching server-side
                        gate; for now just hide the columns. */}
                    <ResizableTh
                      columnKey="changePercent"
                      widths={config.flaggedColumnWidths}
                      setWidth={setFlaggedColWidth}
                      defaultWidth={90}
                      className="text-right cursor-pointer select-none"
                      title="Sort by % Change"
                      onClick={() => cycleFlaggedSort('changePercent')}
                    >
                      % Chg{sortIndicator('changePercent')}
                    </ResizableTh>
                    <ResizableTh
                      columnKey="upper"
                      widths={config.flaggedColumnWidths}
                      setWidth={setFlaggedColWidth}
                      defaultWidth={80}
                      className="text-right"
                    >
                      Upper
                    </ResizableTh>
                    <ResizableTh
                      columnKey="lower"
                      widths={config.flaggedColumnWidths}
                      setWidth={setFlaggedColWidth}
                      defaultWidth={80}
                      className="text-right"
                    >
                      Lower
                    </ResizableTh>
                  </tr>
                </thead>
                <tbody>
                  {flaggedList.map(({ symbol, quote, alertCount }) => {
                    const changeClass = quote?.change > 0 ? 'price-up' : quote?.change < 0 ? 'price-down' : 'price-neutral'

                    return (
                      <tr
                        key={symbol}
                        onClick={() => {
                          setSelectedSymbol(symbol)
                          if (config.ahkEnabled && config.ahkUrl) {
                            fireAhk(symbol, config.ahkUrl)
                          }
                        }}
                        onContextMenu={(e) => handleContextMenu(e, symbol)}
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
                        <td className={clsx('text-right font-mono', changeClass)}>
                          {quote?.changePercent ? `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '-'}
                        </td>
                        {(() => {
                          const hit = findEntry(symbol)
                          const upper = hit?.entry.upperAlert ?? null
                          const lower = hit?.entry.lowerAlert ?? null
                          return (
                            <>
                              <td className="text-right">
                                <PriceAlertInput
                                  value={upper}
                                  onCommit={(n) => updateAlertForFlagged(symbol, 'upperAlert', n)}
                                  triggered={upper != null && triggeredPriceAlerts.has(`upper-${symbol}-${upper}`)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td className="text-right">
                                <PriceAlertInput
                                  value={lower}
                                  onCommit={(n) => updateAlertForFlagged(symbol, 'lowerAlert', n)}
                                  triggered={lower != null && triggeredPriceAlerts.has(`lower-${symbol}-${lower}`)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                            </>
                          )
                        })()}
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
                Select a flagged symbol to view alerts
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right-click Context Menu — portal-mounted, viewport-clamped */}
      {contextMenu && (
        <SymbolContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          symbol={contextMenu.symbol}
          currentListId={null}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
