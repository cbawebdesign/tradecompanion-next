"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { PriceAlertInput } from './PriceAlertInput'
import { clsx } from 'clsx'
import type { Alert } from '@/types'
import { GrokButton } from './GrokButton'
import { PopOutButton } from './PopOutButton'
import { fireAhk } from '@/lib/ahk'
import { copyToClipboard } from '@/lib/clipboard'

// Check if alert should show Grok button (any alert with a URL worth summarizing)
const shouldShowGrok = (alert: Alert): boolean => {
  if (!alert.url) return false
  const type = alert.type.toLowerCase()
  return type === 'filing' || type === 'news' || type === 'catalyst' || type === 'tweet'
}

// Treat as a real ticker for the purposes of AHK / Add-to-Watchlist / Flag.
// RSS/YT/SUB/MAIL/NEWS rows carry these placeholders so the action would
// pollute watchlists or fire AHK on garbage.
const NON_SYMBOLS = new Set(['RSS', 'MAIL', 'YT', 'SUB', 'NEWS', 'N/A', ''])
const isRealSymbol = (s: string | undefined | null): s is string =>
  !!s && !NON_SYMBOLS.has(s.toUpperCase())

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  alert: Alert | null
}

interface AlertBarProps {
  isPopout?: boolean
}

export function AlertBar({ isPopout = false }: AlertBarProps) {
  const {
    alerts,
    config,
    clearAlerts,
    hiddenAlertIds,
    hideAlert,
    removeAlert,
    flaggedSymbols,
    toggleFlag,
    watchlists,
    addSymbolToWatchlist,
    setSelectedSymbol,
    setActiveTab,
    activePane,
    setActivePane,
    updateSymbolInWatchlist,
    triggeredPriceAlerts,
    isBootstrapping,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const isActive = activePane === 'alertbar'
  const [selectedAlertIndex, setSelectedAlertIndex] = useState<number>(-1)

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    alert: null,
  })

  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Filter out hidden alerts
  const visibleAlerts = alerts.filter(a => !hiddenAlertIds.has(a.id)).slice(0, 100)

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }))
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle click to set focus
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        setActivePane('alertbar')
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [setActivePane])

  const handleContextMenu = useCallback((e: React.MouseEvent, alert: Alert) => {
    e.preventDefault()
    // Clamp to the viewport so the menu (incl. its "move/copy to watchlist"
    // items) never renders off-screen — Justin hit this right-clicking near the
    // right/bottom edge of the timeline.
    const MENU_W = 200, MENU_H = 340
    const x = Math.max(4, Math.min(e.clientX, window.innerWidth - MENU_W))
    const y = Math.max(4, Math.min(e.clientY, window.innerHeight - MENU_H))
    setContextMenu({ visible: true, x, y, alert })
  }, [])

  const handleCopyText = useCallback((alert: Alert) => {
    const text = `${alert.symbol}: ${(alert.message || '').replace(/^Catalyst PR\s*/i, '')}`
    copyToClipboard(text)
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [])

  const handleAlertClick = useCallback((alert: Alert) => {
    // Copy text to clipboard
    const text = `${alert.symbol}: ${(alert.message || '').replace(/^Catalyst PR\s*/i, '')}`
    copyToClipboard(text)

    // Fire AHK companion script if enabled (skip for synthetic symbols like RSS/MAIL/N/A)
    if (config.ahkEnabled && config.ahkUrl && isRealSymbol(alert.symbol)) {
      fireAhk(alert.symbol, config.ahkUrl)
    }

    // Always update the selected symbol (powers data ribbon on whichever tab
    // the user is on). Only switch tabs if they're not already on a tab that
    // shows symbol context — Alerts (1) and Watchlist (2) both do.
    setSelectedSymbol(alert.symbol)
    const currentTab = useStore.getState().activeTab
    if (currentTab !== 1 && currentTab !== 2) {
      setActiveTab(2) // Watchlist tab is the safe fallback for other contexts
    }
  }, [setSelectedSymbol, setActiveTab, config.ahkEnabled, config.ahkUrl])

  // Handle clicking on alert message - opens URL for filings/PRs, and (per
  // Justin) also fires AHK with the tagged symbol so the user's charts update
  // alongside the PR opening. Skipped for synthetic RSS/YT/SUB/MAIL/N/A rows.
  const handleAlertMessageClick = useCallback((e: React.MouseEvent, alert: Alert) => {
    e.stopPropagation()

    // Copy alert text to clipboard
    const text = (alert.message || '').replace(/^Catalyst PR\s*/i, '')
    copyToClipboard(text)

    // Update selected symbol + fire AHK (skip pseudo-symbols)
    if (isRealSymbol(alert.symbol)) {
      setSelectedSymbol(alert.symbol)
      if (config.ahkEnabled && config.ahkUrl) {
        fireAhk(alert.symbol, config.ahkUrl)
      }
    }

    // Open URL if present (filings, PRs)
    if (alert.url) {
      window.open(alert.url, '_blank')
    }
  }, [config.ahkEnabled, config.ahkUrl, setSelectedSymbol])

  const handleAddToWatchlist = useCallback((alert: Alert, watchlistId: string) => {
    addSymbolToWatchlist(watchlistId, {
      symbol: alert.symbol,
      upperAlert: null,
      lowerAlert: null,
      notes: '',
    })
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [addSymbolToWatchlist])

  // Keyboard navigation - only when this pane is active
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (visibleAlerts.length === 0) return

      // Don't intercept keys when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable
      if (isEditable) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = selectedAlertIndex < visibleAlerts.length - 1 ? selectedAlertIndex + 1 : 0
        setSelectedAlertIndex(next)
        // Follow the selection with the data ribbon (parity with flagged list /
        // watchlist arrow-nav — Justin wants the ribbon to update on the timeline too).
        const sym = visibleAlerts[next]?.symbol
        if (sym) setSelectedSymbol(sym)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = selectedAlertIndex > 0 ? selectedAlertIndex - 1 : visibleAlerts.length - 1
        setSelectedAlertIndex(next)
        const sym = visibleAlerts[next]?.symbol
        if (sym) setSelectedSymbol(sym)
      } else if (e.key === ' ' && selectedAlertIndex >= 0) {
        // Space → fire AHK + copy symbol to clipboard. Used to also toggle
        // the flag (paired with AHK) but Justin asked to disable that —
        // pressing space from the alerts timeline shouldn't surprise-flag
        // a symbol just to fire an AHK script.
        e.preventDefault()
        const alert = visibleAlerts[selectedAlertIndex]
        if (alert) {
          copyToClipboard(alert.symbol)
          if (config.ahkEnabled && config.ahkUrl && isRealSymbol(alert.symbol)) {
            fireAhk(alert.symbol, config.ahkUrl)
          }
        }
      } else if (e.key === 'Enter' && selectedAlertIndex >= 0) {
        // Enter to select and go to watchlist
        e.preventDefault()
        const alert = visibleAlerts[selectedAlertIndex]
        if (alert) handleAlertClick(alert)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAlertIndex >= 0) {
        // Delete or Backspace to remove alert
        e.preventDefault()
        const alert = visibleAlerts[selectedAlertIndex]
        if (alert) removeAlert(alert.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, visibleAlerts, selectedAlertIndex, toggleFlag, removeAlert, handleAlertClick])

  const formatTime = (date: Date) => {
    const d = new Date(date)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // For inline price-alert inputs on price-type timeline rows. Finds the
  // first watchlist entry for the symbol in saved Settings order so the
  // input reflects + edits that list's thresholds. Lets Justin reset alerts
  // without hunting down the right watchlist.
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
  const updateAlertOnTimeline = (symbol: string, field: 'upperAlert' | 'lowerAlert', value: number | null) => {
    const hit = findEntry(symbol)
    if (!hit) return
    updateSymbolInWatchlist(hit.wl.id, { ...hit.entry, [field]: value })
  }

  // During the first ~8 sec after app start, suppress the timeline render
  // so the user doesn't watch the SignalR + Airtable + TX backfill flood
  // scroll past. Justin: "instead of showing a million messages scrolling
  // on the screen, just show 'Loading Alerts' blank while backfilling".
  if (isBootstrapping) {
    return (
      <div
        ref={containerRef}
        className={clsx(
          'glass-panel rounded-lg px-4 py-2 text-sm flex items-center justify-center transition-all duration-200',
          isActive ? 'pane-active' : 'pane-inactive'
        )}
        style={{ height: `${config.alertBarHeightPercent ?? 25}%`, flexShrink: 0, color: 'var(--text-muted)' }}
      >
        <span className="italic">Loading alerts…</span>
      </div>
    )
  }

  if (visibleAlerts.length === 0) {
    return (
      <div
        ref={containerRef}
        className={clsx(
          'glass-panel rounded-lg px-4 py-2 text-sm transition-all duration-200',
          isActive ? 'pane-active' : 'pane-inactive'
        )}
        style={{ height: `${config.alertBarHeightPercent ?? 25}%`, flexShrink: 0, color: 'var(--text-muted)' }}
      >
        No alerts yet. Alerts will appear here in real-time.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        'glass-panel rounded-lg flex flex-col transition-all duration-200',
        isActive ? 'pane-active' : 'pane-inactive'
      )}
      style={{ height: `${config.alertBarHeightPercent ?? 25}%`, flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1 glass-header rounded-t-lg flex-shrink-0">
        <span className="text-xs text-gray-400">
          {visibleAlerts.length} alert{visibleAlerts.length !== 1 ? 's' : ''}
          {hiddenAlertIds.size > 0 && ` (${hiddenAlertIds.size} hidden)`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={clearAlerts}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Clear all
          </button>
          {!isPopout && (
            <PopOutButton route="/pop/alertbar" title="Alert Bar" width={900} height={400} />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm alert-bar-table">
          <thead className="sticky top-0 bg-gray-800 text-xs text-gray-400">
            <tr>
              <th className="w-8 px-2 py-1 text-center">Flag</th>
              <th className="w-20 px-2 py-1 text-left">Time</th>
              <th className="w-20 px-2 py-1 text-left">Symbol</th>
              {/* Delete button column moved here so it sits between Symbol
                  and Alert — Justin's mouse hangs on this side; clicking
                  the message body fires AHK so the X needs to be off the
                  message itself. */}
              <th className="w-8 px-2 py-1"></th>
              <th className="px-2 py-1 text-left">Alert</th>
              <th className="w-8 px-2 py-1">AI</th>
            </tr>
          </thead>
          <tbody>
            {visibleAlerts.map((alert, index) => {
              const isFlagged = flaggedSymbols.has(alert.symbol)
              const isSelected = isActive && index === selectedAlertIndex
              return (
                <tr
                  key={alert.id}
                  className={clsx(
                    'hover:bg-gray-700/50 cursor-pointer border-b border-gray-800',
                    isSelected && 'bg-blue-900/50'
                  )}
                  onContextMenu={(e) => handleContextMenu(e, alert)}
                  onClick={() => {
                    setSelectedAlertIndex(index)
                    handleAlertClick(alert)
                  }}
                >
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFlag(alert.symbol)
                      }}
                      className={clsx(
                        'text-sm',
                        isFlagged ? 'text-yellow-400' : 'text-gray-600'
                      )}
                    >
                      {isFlagged ? '⚑' : '⚐'}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-gray-400 font-mono text-xs">
                    {formatTime(alert.timestamp)}
                  </td>
                  <td className="px-2 py-1 font-mono font-semibold" style={{ color: alert.color }}>
                    {alert.symbol}
                  </td>
                  <td className="px-2 py-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeAlert(alert.id)
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                      title="Delete alert"
                    >
                      ✕
                    </button>
                  </td>
                  <td className="px-2 py-1 text-gray-300 truncate max-w-md">
                    <span
                      className={clsx(
                        'text-xs px-1.5 py-0.5 rounded mr-2',
                        alert.type === 'price' && 'bg-green-900/50 text-green-400',
                        alert.type === 'filing' && 'bg-blue-900/50 text-blue-400',
                        alert.type === 'news' && 'bg-purple-900/50 text-purple-400',
                        alert.type === 'catalyst' && 'bg-orange-900/50 text-orange-400',
                        alert.type === 'trade_exchange' && 'bg-yellow-900/50 text-yellow-400',
                        alert.type === 'scanner' && 'bg-cyan-900/50 text-cyan-400',
                        alert.type === 'tweet' && 'bg-sky-900/50 text-sky-400',
                        alert.type === 'tradingview' && 'bg-emerald-900/50 text-emerald-400',
                      )}
                    >
                      {alert.type}
                    </span>
                    <span
                      className={clsx(
                        alert.url && 'underline cursor-pointer hover:text-blue-400'
                      )}
                      onClick={(e) => alert.url && handleAlertMessageClick(e, alert)}
                      title={alert.url ? 'Click to open URL and copy' : undefined}
                    >
                      {alert.message}
                    </span>
                    {alert.type === 'price' && (() => {
                      const hit = findEntry(alert.symbol)
                      if (!hit) return null
                      const upper = hit.entry.upperAlert
                      const lower = hit.entry.lowerAlert
                      return (
                        <span className="inline-flex items-center gap-1 ml-2 align-middle" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Upper</span>
                          <PriceAlertInput
                            value={upper}
                            onCommit={(n) => updateAlertOnTimeline(alert.symbol, 'upperAlert', n)}
                            triggered={upper != null && triggeredPriceAlerts.has(`upper-${alert.symbol}-${upper}`)}
                          />
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Lower</span>
                          <PriceAlertInput
                            value={lower}
                            onCommit={(n) => updateAlertOnTimeline(alert.symbol, 'lowerAlert', n)}
                            triggered={lower != null && triggeredPriceAlerts.has(`lower-${alert.symbol}-${lower}`)}
                          />
                        </span>
                      )
                    })()}
                  </td>
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
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.alert && (() => {
        const ca = contextMenu.alert
        const showSymbolActions = isRealSymbol(ca.symbol)
        return (
        <div
          ref={contextMenuRef}
          className="fixed glass-panel rounded-lg shadow-2xl py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {showSymbolActions && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
              onClick={() => {
                toggleFlag(ca.symbol)
                setContextMenu(prev => ({ ...prev, visible: false }))
              }}
            >
              {flaggedSymbols.has(ca.symbol) ? '⚑ Unflag Symbol' : '⚐ Flag Symbol'}
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
            onClick={() => handleCopyText(ca)}
          >
            📋 Copy Alert Text
          </button>
          {ca.url && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
                onClick={() => {
                  window.open(ca.url, '_blank')
                  setContextMenu(prev => ({ ...prev, visible: false }))
                }}
              >
                🔗 Open URL
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
                onClick={() => {
                  copyToClipboard(ca.url!)
                  setContextMenu(prev => ({ ...prev, visible: false }))
                }}
              >
                📎 Copy URL
              </button>
            </>
          )}
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
            onClick={() => {
              hideAlert(ca.id)
              setContextMenu(prev => ({ ...prev, visible: false }))
            }}
          >
            👁 Hide Alert
          </button>
          {showSymbolActions && (
            <>
              <div className="border-t border-gray-600 my-1" />
              <div className="px-3 py-1 text-xs text-gray-500">Add to Watchlist:</div>
              {watchlists.map((wl) => (
                <button
                  key={wl.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 pl-6"
                  onClick={() => handleAddToWatchlist(ca, wl.id)}
                >
                  {wl.name}
                </button>
              ))}
            </>
          )}
          <div className="border-t border-gray-600 my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 text-red-400"
            onClick={() => {
              removeAlert(ca.id)
              setContextMenu(prev => ({ ...prev, visible: false }))
            }}
          >
            🗑 Delete Alert
          </button>
        </div>
      )})()}
    </div>
  )
}
