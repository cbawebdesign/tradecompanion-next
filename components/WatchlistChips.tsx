"use client"

import { useMemo, useState, useRef, useEffect } from 'react'
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

  // Close the +menu on outside click
  useEffect(() => {
    if (!adderOpen) return
    const onDoc = (e: MouseEvent) => {
      if (adderRef.current && !adderRef.current.contains(e.target as Node)) {
        setAdderOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
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
            onClick={() => setAdderOpen((v) => !v)}
            className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-white/10"
            style={{ color: '#00e676' }}
            title="Add to watchlist"
          >
            +
          </button>
          {adderOpen && (
            <div
              className="absolute z-50 mt-1 min-w-[140px] py-1 rounded shadow-lg border"
              style={{
                top: '100%',
                left: 0,
                background: 'var(--bg-panel, #1a1a2e)',
                borderColor: 'var(--border-glass, #333)',
              }}
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
                  onClick={() => handleAdd(wl.id)}
                  className="w-full text-left px-3 py-1 hover:bg-white/10"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {wl.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
