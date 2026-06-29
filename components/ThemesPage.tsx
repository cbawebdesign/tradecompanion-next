"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { fireAhk } from '@/lib/ahk'
import { copyToClipboard } from '@/lib/clipboard'
import { SymbolContextMenu } from './SymbolContextMenu'

// Sectors & Themes board. Reads distinct sectors/themes (+ counts) from the
// backend (GET /api/SectorThemes) and the component symbols for a group on
// demand (GET /api/SymbolsByGroup). Live performance %s come later with the
// performance engine — for now we present what's real (name + symbol count,
// visually weighted) and the click-through popup with the standard symbol-row
// actions (flag / right-click → watchlist / click → AHK / copy all).

type Kind = 'theme' | 'sector'
interface Group { kind: Kind; value: string; count: number; visible?: boolean }

// Best-effort emoji per theme/sector (keyword match; falls back to a dot).
const EMOJI: [RegExp, string][] = [
  [/space|satellite|rocket|launch/i, '🚀'], [/quantum/i, '⚛️'], [/robot/i, '🤖'],
  [/\bai\b|datacenter|data center|machine learning|llm/i, '🧠'], [/nuclear|uranium|fission/i, '☢️'],
  [/\bev\b|electric vehicle/i, '⚡'], [/battery|batteries|lithium/i, '🔋'], [/solar/i, '☀️'],
  [/bio|pharma|gene|drug/i, '🧬'], [/crypto|bitcoin|blockchain|miner/i, '₿'], [/defense|military|weapon/i, '🛡️'],
  [/china/i, '🇨🇳'], [/oil|gas|energy|petro/i, '🛢️'], [/gold|silver|mining|metal/i, '🥇'],
  [/semi|chip|silicon/i, '💾'], [/cyber|security/i, '🔒'], [/drone|uav/i, '🛸'], [/cannabis|weed|marijuana/i, '🌿'],
  [/bank|financ|fintech|insur/i, '🏦'], [/retail|consumer|commerce/i, '🛍️'], [/health|medical|hospital/i, '🏥'],
  [/real estate|reit|housing/i, '🏠'], [/power|grid|utility|electric/i, '🔌'], [/water/i, '💧'],
  [/cloud|software|saas|tech/i, '💻'], [/auto|car/i, '🚗'], [/aero|airline|aviation/i, '✈️'],
  [/food|restaurant|beverage/i, '🍔'], [/gaming|game|casino|gambl/i, '🎮'], [/media|stream|entertain/i, '🎬'],
  [/industrial|manufactur/i, '🏭'], [/agri|farm|food/i, '🌾'],
]
const emojiFor = (v: string) => (EMOJI.find(([re]) => re.test(v))?.[1]) ?? '▪️'

export function ThemesPage() {
  const config = useStore(s => s.config)
  const quotes = useStore(s => s.quotes)
  const flaggedSymbols = useStore(s => s.flaggedSymbols)
  const toggleFlag = useStore(s => s.toggleFlag)
  const setSelectedSymbol = useStore(s => s.setSelectedSymbol)

  const [kind, setKind] = useState<Kind>('theme')
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

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

  const favKey = (g: Group) => `${g.kind}:${g.value}`

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = groups
      .filter(g => g.kind === kind && g.visible !== false)
      .filter(g => !q || g.value.toLowerCase().includes(q))
    // Favorites pinned on top, then by symbol count desc.
    return filtered.sort((a, b) => {
      const fa = favorites.has(favKey(a)) ? 1 : 0
      const fb = favorites.has(favKey(b)) ? 1 : 0
      if (fa !== fb) return fb - fa
      return b.count - a.count
    })
  }, [groups, kind, query, favorites])

  const maxCount = useMemo(() => rows.reduce((m, g) => Math.max(m, g.count), 1), [rows])

  const toggleFav = useCallback((g: Group) => {
    setFavorites(prev => {
      const next = new Set(prev); const k = `${g.kind}:${g.value}`
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

  const fmtPct = (v: number | undefined) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
  const pctClass = (v: number | undefined) => v == null ? '' : v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : ''
  const onSymbolClick = (sym: string) => {
    setSelectedSymbol(sym)
    if (config.ahkEnabled && config.ahkUrl) fireAhk(sym, config.ahkUrl)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 glass-header flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>Sectors &amp; Themes</h3>
          {/* Themes / Sectors pill toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-glass)' }}>
            {(['theme', 'sector'] as Kind[]).map(k => (
              <button key={k} onClick={() => setKind(k)}
                className="text-xs py-1 px-3 capitalize transition-colors"
                style={kind === k
                  ? { background: 'var(--accent-primary)', color: '#fff' }
                  : { background: 'transparent', color: 'var(--text-secondary)' }}>
                {k}s
              </button>
            ))}
          </div>
        </div>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder={`Filter ${kind}s…`}
          className="text-xs py-1 px-2.5 rounded-md w-40"
          style={{ background: 'var(--bg-glass-light)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {loading && <div className="p-8 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>Loading sectors &amp; themes…</div>}
        {!loading && error && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Couldn&apos;t load ({error}).
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {query ? `No ${kind}s match “${query}”.` : `No ${kind}s yet — tag symbols in the admin dashboard.`}
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="flex flex-col gap-1">
            {rows.map(g => {
              const isFav = favorites.has(favKey(g))
              const pct = Math.max(6, Math.round((g.count / maxCount) * 100))
              return (
                <button key={favKey(g)} onClick={() => openPopup(g)}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors w-full"
                  style={{
                    background: isFav ? 'rgba(251,191,36,.07)' : 'var(--bg-glass-light)',
                    border: `1px solid ${isFav ? 'rgba(251,191,36,.35)' : 'var(--border-glass)'}`,
                  }}>
                  <span onClick={(e) => { e.stopPropagation(); toggleFav(g) }}
                    className={clsx('text-base leading-none', isFav ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400')}>
                    {isFav ? '★' : '☆'}
                  </span>
                  <span className="text-lg leading-none w-6 text-center">{emojiFor(g.value)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{g.value}</span>
                    {/* count bar — gives the board visual weight from real data */}
                    <span className="block mt-1 h-1 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                      <span className="block h-1 rounded-full" style={{ width: `${pct}%`, background: 'var(--accent-primary)', opacity: .55 }} />
                    </span>
                  </span>
                  <span className="text-right whitespace-nowrap">
                    <span className="block text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{g.count}</span>
                    <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>symbols</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 text-[11px] flex-shrink-0 border-t" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-glass)' }}>
        {rows.length} {kind}{rows.length === 1 ? '' : 's'} · tap one for its symbols · live % &amp; 1W–YTD performance coming with the data engine
      </div>

      {/* Component popup */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => { setPopup(null); setCtxMenu(null) }}>
          <div className="glass-panel rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-glass)' }}>
              <div className="text-sm flex items-center gap-2">
                <span className="text-lg leading-none">{emojiFor(popup.value)}</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{popup.value}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{popSymbols.length} symbols</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-xs hover:underline" style={{ color: 'var(--text-secondary)' }}
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
                      const v = quotes[sym]?.changePercent
                      return (
                        <tr key={sym} className="cursor-pointer border-b hover:bg-gray-700/30" style={{ borderColor: 'var(--border-glass)' }}
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
        <SymbolContextMenu x={ctxMenu.x} y={ctxMenu.y} symbol={ctxMenu.symbol} currentListId={null} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
