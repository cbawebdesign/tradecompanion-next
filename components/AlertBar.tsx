"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import type { Alert } from '@/types'
import { GrokButton } from './GrokButton'
import { PopOutButton } from './PopOutButton'
import { fireAhk } from '@/lib/ahk'

// Check if alert should show Grok button (any alert with a URL worth summarizing)
const shouldShowGrok = (alert: Alert): boolean => {
  if (!alert.url) return false
  const type = alert.type.toLowerCase()
  return type === 'filing' || type === 'news' || type === 'catalyst' || type === 'tweet'
}

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
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      alert,
    })
  }, [])

  const handleCopyText = useCallback((alert: Alert) => {
    const text = `${alert.symbol}: ${(alert.message || '').replace(/^Catalyst PR\s*/i, '')}`
    navigator.clipboard.writeText(text)
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [])

  const handleAlertClick = useCallback((alert: Alert) => {
    // Copy text to clipboard
    const text = `${alert.symbol}: ${(alert.message || '').replace(/^Catalyst PR\s*/i, '')}`
    navigator.clipboard.writeText(text)

    // Fire AHK companion script if enabled (skip for synthetic symbols like RSS/MAIL/N/A)
    if (config.ahkEnabled && config.ahkUrl && alert.symbol && !['RSS', 'MAIL', 'YT', 'SUB', 'NEWS', 'N/A'].includes(alert.symbol)) {
      fireAhk(alert.symbol, config.ahkUrl)
    }

    // Set selected symbol and go to watchlist tab
    setSelectedSymbol(alert.symbol)
    setActiveTab(2) // Watchlist tab
  }, [setSelectedSymbol, setActiveTab, config.ahkEnabled, config.ahkUrl])

  // Handle clicking on alert message - opens URL for filings/PRs
  const handleAlertMessageClick = useCallback((e: React.MouseEvent, alert: Alert) => {
    e.stopPropagation()

    // Copy alert text to clipboard
    const text = (alert.message || '').replace(/^Catalyst PR\s*/i, '')
    navigator.clipboard.writeText(text)

    // Open URL if present (filings, PRs)
    if (alert.url) {
      window.open(alert.url, '_blank')
    }
  }, [])

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
        setSelectedAlertIndex(prev =>
          prev < visibleAlerts.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedAlertIndex(prev =>
          prev > 0 ? prev - 1 : visibleAlerts.length - 1
        )
      } else if (e.key === ' ' && selectedAlertIndex >= 0) {
        // Space to flag symbol + copy to clipboard for AHK/Hammerspoon
        e.preventDefault()
        const alert = visibleAlerts[selectedAlertIndex]
        if (alert) {
          toggleFlag(alert.symbol)
          navigator.clipboard.writeText(alert.symbol).catch(() => {})
          if (config.ahkEnabled && config.ahkUrl && !['RSS', 'MAIL', 'YT', 'SUB', 'NEWS', 'N/A'].includes(alert.symbol)) {
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
              <th className="px-2 py-1 text-left">Alert</th>
              <th className="w-8 px-2 py-1">AI</th>
              <th className="w-8 px-2 py-1"></th>
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.alert && (
        <div
          ref={contextMenuRef}
          className="fixed glass-panel rounded-lg shadow-2xl py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
            onClick={() => {
              toggleFlag(contextMenu.alert!.symbol)
              setContextMenu(prev => ({ ...prev, visible: false }))
            }}
          >
            {flaggedSymbols.has(contextMenu.alert.symbol) ? '⚑ Unflag Symbol' : '⚐ Flag Symbol'}
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
            onClick={() => handleCopyText(contextMenu.alert!)}
          >
            📋 Copy Alert Text
          </button>
          {contextMenu.alert.url && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
                onClick={() => {
                  window.open(contextMenu.alert!.url, '_blank')
                  setContextMenu(prev => ({ ...prev, visible: false }))
                }}
              >
                🔗 Open URL
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700"
                onClick={() => {
                  navigator.clipboard.writeText(contextMenu.alert!.url!)
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
              hideAlert(contextMenu.alert!.id)
              setContextMenu(prev => ({ ...prev, visible: false }))
            }}
          >
            👁 Hide Alert
          </button>
          <div className="border-t border-gray-600 my-1" />
          <div className="px-3 py-1 text-xs text-gray-500">Add to Watchlist:</div>
          {watchlists.map((wl) => (
            <button
              key={wl.id}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 pl-6"
              onClick={() => handleAddToWatchlist(contextMenu.alert!, wl.id)}
            >
              {wl.name}
            </button>
          ))}
          <div className="border-t border-gray-600 my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 text-red-400"
            onClick={() => {
              removeAlert(contextMenu.alert!.id)
              setContextMenu(prev => ({ ...prev, visible: false }))
            }}
          >
            🗑 Delete Alert
          </button>
        </div>
      )}
    </div>
  )
}
