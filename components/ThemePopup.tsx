"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store/useStore'
import { copyToClipboard } from '@/lib/clipboard'
import { SymbolContextMenu } from './SymbolContextMenu'
import { ChartToast, ThemeSymbolCell, useSendToChart } from './ThemeSymbolCell'
import { forceCosmosSyncNow } from '@/hooks/useCosmosSync'
import {
  COLUMN_SCALE, PERF_COLUMNS, fetchThemeDetail, fmtPct, pctCellStyle, pillColors, sortMembers, splitByCap,
  isThemeStarred, toggleThemeStar,
  type PerfKey, type ThemeDetail, type ThemeMember,
} from '@/lib/themePerformance'

/**
 * Click a theme pill on the Data Ribbon → this popup, in the format of Justin's
 * Theme Performance report (reports.tradecompanion.com): the theme's own row,
 * then its stocks, Today / 1W / 1M / 3M / 6M / YTD on a red-green scale,
 * sortable headers. Meeting 10/31: large caps open by default, small caps under
 * a collapsible arrow "to identify sympathy plays when sector news breaks", and
 * a flag + add-to-watchlist on every row with AHK on the ticker — the look of
 * his TickerText files ([+][flag] TICKER, gold ticker, "Sent X to chart").
 */
export function ThemePopup({ theme, focusSymbol, onClose }: { theme: string; focusSymbol?: string; onClose: () => void }) {
  const hubUrl = useStore(s => s.config.hubUrl)
  const starredThemes = useStore(s => s.config.starredThemes)
  const updateConfig = useStore(s => s.updateConfig)

  // Justin (11/4): "a user can 'Flag' (or star) themes of interest and then
  // those themes would stay on the flagged list page until the user unstars
  // ... when a user clicks on the pill and the report pops up maybe we put a
  // Star to the left". Here and only here — he wants the ribbon and the
  // Flagged list kept clean, so this popup is where a theme is starred AND
  // where it is unstarred.
  const starred = isThemeStarred(starredThemes, theme)
  const toggleStar = () => {
    updateConfig({ starredThemes: toggleThemeStar(starredThemes, theme) })
    // Push now rather than on the debounce: a star set just before closing TC
    // should not be lost. No-op in a pop-out, where the main window syncs it.
    forceCosmosSyncNow()
  }

  const [detail, setDetail] = useState<ThemeDetail | null>(null)
  const [asOf, setAsOf] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState<PerfKey>('today')
  const [sortDesc, setSortDesc] = useState(true)
  const [smallOpen, setSmallOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; symbol: string } | null>(null)
  const focusRow = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true); setError(''); setDetail(null)
    fetchThemeDetail(hubUrl, theme, ctrl.signal)
      .then(({ asOfUtc, theme: t }) => {
        setAsOf(asOfUtc)
        setDetail(t)
        // The stock whose pill was clicked must be on screen. Justin (NAUT, 11/1)
        // couldn't find it — it is a small cap, so it sat under the closed arrow.
        const focus = focusSymbol?.toUpperCase()
        if (focus && t?.members.some(m => m.symbol === focus && m.cap === 'small')) setSmallOpen(true)
        if (!t) setError('No stocks are tagged with this theme in the Theme Tracker.')
      })
      .catch(err => { if (err?.name !== 'AbortError') setError('Could not load theme performance.') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [hubUrl, theme, focusSymbol])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (ctxMenu) setCtxMenu(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctxMenu, onClose])

  // Bring the focused stock into view once its section is rendered.
  useEffect(() => {
    focusRow.current?.scrollIntoView({ block: 'center' })
  }, [detail, smallOpen])

  const { large, small } = useMemo(() => {
    const split = splitByCap(detail?.members ?? [])
    return { large: sortMembers(split.large, sortKey, sortDesc), small: sortMembers(split.small, sortKey, sortDesc) }
  }, [detail, sortKey, sortDesc])

  const onSort = (key: PerfKey) => {
    if (key === sortKey) setSortDesc(d => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  // Ticker click sends it to the chart and nothing else. It used to select the
  // symbol too, which swapped the ribbon behind the popup — and the pills that
  // own this popup reload with the ribbon, so it closed. Justin (11/1): "When I
  // click the symbol to activate AHK, the pop up automatically closes."
  const { sendToChart, toast } = useSendToChart()

  const asOfText = asOf ? new Date(asOf).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : ''
  const chip = pillColors(theme)

  const row = (m: ThemeMember) => (
    <tr key={m.symbol} ref={m.symbol === focusSymbol?.toUpperCase() ? focusRow : undefined}
      className="border-b hover:bg-white/[0.03]"
      style={{ borderColor: 'var(--border-glass)', ...(m.symbol === focusSymbol?.toUpperCase() ? { background: 'var(--accent-glow)' } : {}) }}
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, symbol: m.symbol }) }}>
      <td className="w-px pl-3 pr-3 py-1 whitespace-nowrap">
        <ThemeSymbolCell symbol={m.symbol} onChart={sendToChart}
          onAdd={(r) => setCtxMenu({ x: r.left, y: r.bottom + 4, symbol: m.symbol })} />
      </td>
      <td className="px-2 py-1 truncate max-w-[220px]" style={{ color: 'var(--text-muted)' }} title={m.company}>{m.company}</td>
      {PERF_COLUMNS.map(c => (
        <td key={c.key} className="px-2 py-1 text-right font-mono text-xs tabular-nums" style={pctCellStyle(m[c.key], COLUMN_SCALE[c.key])}>{fmtPct(m[c.key])}</td>
      ))}
    </tr>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={() => { setCtxMenu(null); onClose() }}>
      <div className="glass-panel rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={toggleStar} aria-pressed={starred}
              aria-label={starred ? `Unstar ${theme}` : `Star ${theme}`}
              title={starred ? 'Starred — showing on your Flagged list. Click to remove.' : 'Star this theme to keep it on your Flagged list'}
              className="text-lg leading-none hover:scale-110 transition-transform"
              style={{ color: starred ? '#facc15' : 'var(--text-muted)' }}>{starred ? '★' : '☆'}</button>
            <span className="px-2 py-0.5 rounded-full text-sm font-semibold" style={{ background: chip.background, color: chip.color, border: `1px solid ${chip.border}` }}>{theme}</span>
            {detail && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{detail.count} stocks · {detail.weighting === 'equal' ? 'equal weight' : 'Cap-weighted'}{asOfText ? ` · ${asOfText}` : ''}</span>}
          </div>
          <div className="flex items-center gap-3">
            {detail && (
              <button className="text-xs hover:underline" style={{ color: 'var(--text-secondary)' }}
                onClick={() => copyToClipboard(detail.members.map(m => m.symbol).join(','))}
                title="Copy all symbols (for pasting into a watchlist)">Copy all</button>
            )}
            <button className="text-xl leading-none" style={{ color: 'var(--text-muted)' }} onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && <div className="p-5 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && error && <div className="p-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>{error}</div>}
          {!loading && detail && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                <tr>
                  <th className="w-px pl-3 pr-3 py-1.5 text-left font-semibold">Symbol</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Company</th>
                  {PERF_COLUMNS.map(c => (
                    <th key={c.key} className="px-2 py-1.5 text-right font-semibold cursor-pointer select-none whitespace-nowrap"
                      style={{ color: sortKey === c.key ? 'var(--text-primary)' : undefined }}
                      onClick={() => onSort(c.key)} title={`Sort by ${c.label}`}>
                      {c.label}{sortKey === c.key ? (sortDesc ? ' ▾' : ' ▴') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* The theme itself — the row his report shows before expanding. */}
                <tr className="border-b-2" style={{ borderColor: 'var(--border-glass)' }}>
                  <td className="pl-3 pr-2 py-1.5 font-semibold" style={{ color: 'var(--text-primary)' }} colSpan={2}>Theme <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(large caps)</span></td>
                  {PERF_COLUMNS.map(c => (
                    <td key={c.key} className="px-2 py-1.5 text-right font-mono text-xs font-semibold tabular-nums" style={pctCellStyle(detail[c.key], COLUMN_SCALE[c.key])}>{fmtPct(detail[c.key])}</td>
                  ))}
                </tr>
                {large.length > 0 && (
                  <tr><td colSpan={2 + PERF_COLUMNS.length} className="pl-3 pt-2 pb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Large caps · {large.length}</td></tr>
                )}
                {large.map(row)}
                {small.length > 0 && (
                  <tr className="cursor-pointer select-none" onClick={() => setSmallOpen(o => !o)}>
                    <td colSpan={2 + PERF_COLUMNS.length} className="pl-3 pt-2 pb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      {smallOpen ? '▾' : '▸'} Small caps · {small.length}
                    </td>
                  </tr>
                )}
                {smallOpen && small.map(row)}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-1.5 text-[11px] border-t flex-shrink-0" style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }}>
          Theme = the large caps weighted by Cap (Float × Price), no stock above 25%; ETF is equal weight. Base price under $0.50 is left out. Rows show each stock&apos;s actual move. Click a ticker to send it to your chart; right-click for watchlists.
        </div>
      </div>

      <ChartToast text={toast} />

      {ctxMenu && (
        <div onClick={(e) => e.stopPropagation()}>
          <SymbolContextMenu x={ctxMenu.x} y={ctxMenu.y} symbol={ctxMenu.symbol} currentListId={null} onClose={() => setCtxMenu(null)} />
        </div>
      )}
    </div>,
    document.body,
  )
}
