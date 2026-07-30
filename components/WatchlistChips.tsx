"use client"

import { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store/useStore'

interface WatchlistChipsProps {
  symbol: string
}

/**
 * "Watchlist row" inside the data ribbon. Solves Justin's three asks at once:
 *   1. See every watchlist the current symbol is on
 *   2. Add to a watchlist without leaving the ribbon
 *   3. Remove from a watchlist (with confirm) without leaving the ribbon
 *
 * Order matches config.watchlistOrder so the chips line up with the dropdown.
 */
export function WatchlistChips({ symbol }: WatchlistChipsProps) {
  const rawWatchlists = useStore((s) => s.watchlists)
  const watchlistOrder = useStore((s) => s.config.watchlistOrder)
  const addSymbolToWatchlist = useStore((s) => s.addSymbolToWatchlist)
  const removeSymbolFromWatchlist = useStore((s) => s.removeSymbolFromWatchlist)

  const [adderOpen, setAdderOpen] = useState(false)
  const adderRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  // `anchor` = raw position under the + button, set ONCE per open (stable).
  // `pos`    = final clamped position the menu actually renders at.
  // Keeping these separate is the whole ballgame: the clamp effect depends on
  // `anchor` (which doesn't change while open) and writes `pos`, so it can never
  // re-trigger itself. The earlier version depended on the same state it wrote,
  // and under the live-updating ribbon the menu's measured size shifted between
  // renders, so it re-clamped forever → "Maximum update depth exceeded" crash
  // when you hit "+". Mirrors the working SymbolContextMenu (clamps off the
  // trigger coords, not the position it sets).
  const [anchor, setAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Open the picker anchored under the + button. It's portaled to <body> below
  // so it floats over the whole app instead of being clipped by the ribbon
  // (Justin: "float this dropdown across the entire app"). NO scroll/resize close
  // listener — the data ribbon streams updates and a capture-phase scroll-close
  // dismissed the menu on open. Click-away / Esc is enough.
  const openAdder = () => {
    if (adderOpen) { setAdderOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    const a = r ? { top: r.bottom + 4, left: r.left } : { top: 0, left: 0 }
    setAnchor(a)
    setPos(a)
    setAdderOpen(true)
  }

  // Clamp into the viewport after render (flip up/left if it would run off-screen —
  // Justin: the bottom of the list was getting cut off with lots of watchlists).
  // Depends on `anchor` ONLY (stable per open), writes `pos` → runs once, never loops.
  useLayoutEffect(() => {
    if (!adderOpen || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const pad = 8
    let top = anchor.top
    let left = anchor.left
    if (top + rect.height + pad > window.innerHeight) top = Math.max(pad, window.innerHeight - rect.height - pad)
    if (left + rect.width + pad > window.innerWidth) left = Math.max(pad, window.innerWidth - rect.width - pad)
    setPos({ top, left })
  }, [adderOpen, anchor.top, anchor.left])

  // Close on outside click (the menu is portaled, so check both refs) + Escape.
  useEffect(() => {
    if (!adderOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (adderRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setAdderOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdderOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onEsc)
    }
  }, [adderOpen])

  const upper = symbol.toUpperCase()

  const { onLists, offLists } = useMemo(() => {
    const ordered = (() => {
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
    const on: typeof ordered = []
    const off: typeof ordered = []
    for (const wl of ordered) {
      const has = wl.symbols.some((s) => s.symbol.toUpperCase() === upper)
      if (has) on.push(wl); else off.push(wl)
    }
    return { onLists: on, offLists: off }
  }, [rawWatchlists, watchlistOrder, upper])

  const handleRemove = (wlId: string, wlName: string) => {
    if (!confirm(`Remove ${upper} from "${wlName}"?`)) return
    removeSymbolFromWatchlist(wlId, upper)
  }

  const handleAdd = (wlId: string) => {
    addSymbolToWatchlist(wlId, { symbol: upper, upperAlert: null, lowerAlert: null, notes: '' })
    setAdderOpen(false)
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-xs flex-wrap"
      style={{
        background: 'var(--bg-glass)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span className="font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Watchlists
      </span>

      {onLists.length === 0 && (
        <span className="italic" style={{ color: '#666' }}>Not on any watchlist</span>
      )}

      {onLists.map((wl) => (
        <span
          key={wl.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(100, 181, 246, 0.15)', color: '#64b5f6' }}
        >
          {wl.name}
          <button
            type="button"
            onClick={() => handleRemove(wl.id, wl.name)}
            className="hover:text-red-400 transition-colors"
            style={{ fontSize: '11px', lineHeight: 1 }}
            title={`Remove from ${wl.name}`}
          >
            ✕
          </button>
        </span>
      ))}

      {offLists.length > 0 && (
        <div ref={adderRef} className="relative inline-block">
          <button
            type="button"
            ref={btnRef}
            onClick={openAdder}
            className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-white/10"
            style={{ color: '#00e676' }}
            title="Add to watchlist"
          >
            +
          </button>
          {adderOpen && createPortal(
            <div
              ref={menuRef}
              className="fixed z-[1000] min-w-[160px] max-h-[80vh] overflow-y-auto py-1 rounded shadow-lg border"
              style={{
                top: pos.top,
                left: pos.left,
                background: 'var(--bg-panel, #1a1a2e)',
                borderColor: 'var(--border-glass, #333)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider border-b"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border-glass, #333)' }}
              >
                Add to...
              </div>
              {offLists.map((wl) => (
                <button
                  key={wl.id}
                  type="button"
                  onClick={() => { handleAdd(wl.id); setAdderOpen(false) }}
                  className="w-full text-left px-3 py-1 hover:bg-white/10"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {wl.name}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  )
}
