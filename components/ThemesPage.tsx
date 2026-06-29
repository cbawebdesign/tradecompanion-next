"use client"

import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { fireAhk } from '@/lib/ahk'
import { copyToClipboard } from '@/lib/clipboard'
import { SymbolContextMenu } from './SymbolContextMenu'

// Sectors & Themes board. Reads distinct sectors/themes (+ counts) from the
// backend (GET /api/SectorThemes) and the component symbols for a group on
// demand (GET /api/SymbolsByGroup). Day %/Open % per group come later with the
// performance engine — for now the board shows the structure + live group data
// and the click-through popup lists components with the standard symbol-row
// actions (flag / right-click → watchlist / click → AHK).

type Kind = 'theme' | 'sector'
interface Group { kind: Kind; value: string; count: number; visible?: boolean }

const TIMEFRAMES = ['Day', 'Open', '1W', '1M', '3M', '6M', 'YTD'] as const

export function ThemesPage() {
  const config = useStore(s => s.config)
  const quotes = useStore(s => s.quotes)
  const flaggedSymbols = useStore(s => s.flaggedSymbols)
  const toggleFlag = useStore(s => s.toggleFlag)
  const setSelectedSymbol = useStore(s => s.setSelectedSymbol)

  const [kind, setKind] = useState<Kind>('theme')
  const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>('Day')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // Popup (component symbols for a clicked group)
  const [popup, setPopup] = useState<Group | null>(null)
  const [popSymbols, setPopSymbols] = useState<string[]>([])
  const [popLoading, setPopLoading] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; symbol: string } | null>(null)

  const base = config.hubUrl

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    fetch(`${base}/SectorThemes`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => { if (!cancelled) { setGroups(Array.isArray(data) ? data : []); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'failed'); setLoading(false) } })
    return () => { cancelled = true }
  }, [base])

  const rows = groups
    .filter(g => g.kind === kind && g.visible !== false)
    .sort((a, b) => b.count - a.count)

  const favKey = (g: Group) => `${g.kind}:${g.value}`
  const toggleFav = useCallback((g: Group) => {
    setFavorites(prev => {
      const next = new Set(prev)
      const k = `${g.kind}:${g.value}`
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }, [])

  const openPopup = useCallback((g: Group) => {
    setPopup(g); setPopLoading(true); setPopSymbols([])
    fetch(`${base}/SymbolsByGroup?kind=${encodeURIComponent(g.kind)}&value=${encodeURIComponent(g.value)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((s) => setPopSymbols(Array.isArray(s) ? s : []))
      .catch(() => setPopSymbols([]))
      .finally(() => setPopLoading(false))
  }, [base])

  const pct = (sym: string) => quotes[sym]?.changePercent
  const fmtPct = (v: number | undefined) =>
    v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
  const pctClass = (v: number | undefined) =>
    v == null ? '' : v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : ''

  const onSymbolClick = (sym: string) => {
    setSelectedSymbol(sym)
    if (config.ahkEnabled && config.ahkUrl) fireAhk(sym, config.ahkUrl)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 glass-header flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sectors &amp; Themes</h3>
        <div className="flex items-center gap-3">
          {/* Themes / Sectors toggle */}
          <div className="flex gap-1">
            {(['theme', 'sector'] as Kind[]).map(k => (
              <button key={k} onClick={() => setKind(k)}
                className={clsx('text-xs py-1 px-3 rounded capitalize', kind === k ? 'btn btn-primary' : '')}
                style={kind === k ? {} : { background: 'var(--bg-glass-light)', color: 'var(--text-secondary)' }}>
                {k}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeframe toggle */}
      <div className="px-3 py-1.5 flex items-center gap-1 flex-shrink-0" style={{ background: 'var(--bg-glass-light)' }}>
        {TIMEFRAMES.map(t => (
          <button key={t} onClick={() => setTimeframe(t)}
            className={clsx('text-xs py-0.5 px-2.5 rounded', timeframe === t ? 'btn btn-primary' : '')}
            style={timeframe === t ? {} : { color: 'var(--text-muted)' }}
            title={t === 'Day' || t === 'Open' ? '' : 'Historical timeframes come with the performance engine'}>
            {t}
          </button>
        ))}
        <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          % = average of component moves
        </span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-6 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>Loading sectors &amp; themes…</div>}
        {!loading && error && (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Couldn&apos;t load sectors &amp; themes ({error}).<br />
            <span className="text-xs">The backend endpoint may not be deployed yet.</span>
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No {kind}s found yet. Tag symbols with a {kind} in the admin dashboard and they&apos;ll appear here.
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0" style={{ background: 'var(--bg-secondary)' }}>
              <tr className="text-xs" style={{ color: 'var(--text-muted)' }}>
                <th className="w-8 px-2 py-1.5"></th>
                <th className="px-2 py-1.5 text-left capitalize">{kind}</th>
                <th className="w-12 px-2 py-1.5 text-right">#</th>
                <th className="w-24 px-2 py-1.5 text-right">{timeframe} %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(g => {
                const isFav = favorites.has(favKey(g))
                return (
                  <tr key={favKey(g)}
                    className="cursor-pointer border-b hover:bg-gray-700/30"
                    style={{ borderColor: 'var(--border-glass)' }}
                    onClick={() => openPopup(g)}>
                    <td className="px-2 py-1.5 text-center" onClick={(e) => { e.stopPropagation(); toggleFav(g) }}>
                      <span className={isFav ? 'text-yellow-400' : 'text-gray-600'}>{isFav ? '★' : '☆'}</span>
                    </td>
                    <td className="px-2 py-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>{g.value}</td>
                    <td className="px-2 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>{g.count}</td>
                    <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--text-muted)' }}>—</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Component popup */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => { setPopup(null); setCtxMenu(null) }}>
          <div className="glass-panel rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-glass)' }}>
              <div className="text-sm">
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{popup.value}</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>{popSymbols.length} symbols</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-xs" style={{ color: 'var(--text-secondary)' }}
                  onClick={() => popSymbols.length && copyToClipboard(popSymbols.join(','))}
                  title="Copy all symbols (for pasting into a watchlist)">📋 Copy all</button>
                <button className="text-xl leading-none" style={{ color: 'var(--text-muted)' }}
                  onClick={() => { setPopup(null); setCtxMenu(null) }} aria-label="Close">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {popLoading && <div className="p-5 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
              {!popLoading && popSymbols.length === 0 && <div className="p-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No symbols.</div>}
              {!popLoading && popSymbols.length > 0 && (
                <table className="w-full text-sm">
                  <tbody>
                    {popSymbols.map(sym => {
                      const isFlagged = flaggedSymbols.has(sym)
                      const v = pct(sym)
                      return (
                        <tr key={sym}
                          className="cursor-pointer border-b hover:bg-gray-700/30"
                          style={{ borderColor: 'var(--border-glass)' }}
                          onClick={() => onSymbolClick(sym)}
                          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, symbol: sym }) }}>
                          <td className="w-8 px-2 py-1.5 text-center" onClick={(e) => { e.stopPropagation(); toggleFlag(sym) }}>
                            <span className={isFlagged ? 'text-yellow-400' : 'text-gray-600'}>{isFlagged ? '⚑' : '⚐'}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{sym}</td>
                          <td className={clsx('px-2 py-1.5 text-right font-mono', pctClass(v))}>{fmtPct(v)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {ctxMenu && (
        <SymbolContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          symbol={ctxMenu.symbol}
          currentListId={null}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
