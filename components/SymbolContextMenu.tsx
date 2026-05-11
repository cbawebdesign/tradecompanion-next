"use client"

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store/useStore'

export interface SymbolContextMenuProps {
  x: number
  y: number
  symbol: string
  /** ID of the list the symbol was right-clicked from. null = no current list (e.g. flagged view). */
  currentListId: string | null
  /** Action to remove the symbol from the current list. Called only when currentListId is non-null. */
  onRemove?: () => void
  onClose: () => void
}

/**
 * Renders a right-click menu for a symbol. Portal-mounted on document.body
 * so it can never be clipped by a parent's overflow, and auto-flips up if
 * it would overflow the viewport bottom.
 *
 * Used by both the Watchlist tab and the Flagged Symbols (AlertsPage) tab.
 */
export function SymbolContextMenu({
  x,
  y,
  symbol,
  currentListId,
  onRemove,
  onClose,
}: SymbolContextMenuProps) {
  const rawWatchlists = useStore((s) => s.watchlists)
  const watchlistOrder = useStore((s) => s.config.watchlistOrder)
  const addSymbolToWatchlist = useStore((s) => s.addSymbolToWatchlist)
  const removeSymbolFromWatchlist = useStore((s) => s.removeSymbolFromWatchlist)
  const toggleFlag = useStore((s) => s.toggleFlag)
  const flaggedSymbols = useStore((s) => s.flaggedSymbols)

  // Render watchlists in the user's saved Settings order — the dropdown is
  // already ordered, so the right-click menu needs to match. Otherwise users
  // pick by position and end up adding to the wrong list.
  const watchlists = (() => {
    if (!watchlistOrder || watchlistOrder.length === 0) return rawWatchlists
    const byId = new Map(rawWatchlists.map((w) => [w.id, w]))
    const out: typeof rawWatchlists = []
    for (const id of watchlistOrder) {
      const w = byId.get(id)
      if (w) { out.push(w); byId.delete(id) }
    }
    Array.from(byId.values()).forEach((w) => out.push(w))
    return out
  })()

  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ top: y, left: x })

  // Flip menu so it stays inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    const pad = 8
    let top = y
    let left = x
    if (top + rect.height + pad > vh) top = Math.max(pad, vh - rect.height - pad)
    if (left + rect.width + pad > vw) left = Math.max(pad, vw - rect.width - pad)
    setPos({ top, left })
  }, [x, y])

  // Close on click-away or Escape.
  useEffect(() => {
    const close = () => onClose()
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', handleEsc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null

  const isFlagged = flaggedSymbols.has(symbol)
  const otherLists = watchlists.filter((w) => w.id !== currentListId)
  const sourceList = currentListId ? watchlists.find((w) => w.id === currentListId) : null

  const handleMove = (targetId: string) => {
    if (!sourceList) return
    const current = sourceList.symbols.find((s) => s.symbol === symbol)
    if (!current) return
    removeSymbolFromWatchlist(sourceList.id, symbol)
    addSymbolToWatchlist(targetId, { ...current })
    onClose()
  }

  const handleCopy = (targetId: string) => {
    const src = sourceList?.symbols.find((s) => s.symbol === symbol)
    addSymbolToWatchlist(
      targetId,
      src ? { ...src } : { symbol, upperAlert: null, lowerAlert: null, notes: '' }
    )
    onClose()
  }

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[1000] min-w-[170px] py-1 rounded shadow-lg border max-h-[80vh] overflow-y-auto"
      style={{
        top: pos.top,
        left: pos.left,
        background: 'var(--bg-panel, #1a1a2e)',
        borderColor: 'var(--border-glass, #333)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b"
        style={{ borderColor: 'var(--border-glass, #333)' }}
      >
        {symbol}
      </div>

      <button
        className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 text-yellow-300"
        onClick={() => { toggleFlag(symbol); onClose() }}
      >
        {isFlagged ? 'Unflag' : 'Flag'}
      </button>

      {currentListId && onRemove && (
        <button
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 text-red-400"
          onClick={() => { onRemove(); onClose() }}
        >
          Remove from {sourceList?.name || 'list'}
        </button>
      )}

      {otherLists.length > 0 && currentListId && (
        <>
          <div className="h-px my-0.5" style={{ background: 'var(--border-glass, #333)' }} />
          <div className="px-3 py-1 text-xs text-gray-500">Move to...</div>
          {otherLists.map((wl) => (
            <button
              key={`move-${wl.id}`}
              className="w-full text-left px-5 py-1 text-sm hover:bg-white/10 text-gray-300"
              onClick={() => handleMove(wl.id)}
            >
              {wl.name}
            </button>
          ))}
        </>
      )}

      {watchlists.length > 0 && (
        <>
          <div className="h-px my-0.5" style={{ background: 'var(--border-glass, #333)' }} />
          <div className="px-3 py-1 text-xs text-gray-500">
            {currentListId ? 'Copy to...' : 'Add to watchlist...'}
          </div>
          {(currentListId ? otherLists : watchlists).map((wl) => (
            <button
              key={`copy-${wl.id}`}
              className="w-full text-left px-5 py-1 text-sm hover:bg-white/10 text-gray-300"
              onClick={() => handleCopy(wl.id)}
            >
              {wl.name}
            </button>
          ))}
        </>
      )}
    </div>,
    document.body
  )
}
