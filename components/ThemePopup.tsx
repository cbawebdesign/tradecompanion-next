"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store/useStore'
import { fireAhk } from '@/lib/ahk'
import { copyToClipboard } from '@/lib/clipboard'
import { SymbolContextMenu } from './SymbolContextMenu'
import {
  PERF_COLUMNS, fetchThemeDetail, fmtPct, pctCellStyle, pillColors, sortMembers, splitByCap,
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
export function ThemePopup({ theme, onClose }: { theme: string; onClose: () => void }) {
  const hubUrl = useStore(s => s.config.hubUrl)
  const ahkEnabled = useStore(s => s.config.ahkEnabled)
  const ahkUrl = useStore(s => s.config.ahkUrl)
  const flaggedSymbols = useStore(s => s.flaggedSymbols)
  const toggleFlag = useStore(s => s.toggleFlag)

  const [detail, setDetail] = useState<ThemeDetail | null>(null)
  const [asOf, setAsOf] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState<PerfKey>('today')
  const [sortDesc, setSortDesc] = useState(true)
  const [smallOpen, setSmallOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; symbol: string } | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true); setError(''); setDetail(null)
    fetchThemeDetail(hubUrl, theme, ctrl.signal)
      .then(({ asOfUtc, theme: t }) => {
        setAsOf(asOfUtc)
        setDetail(t)
        if (!t) setError('No stocks are tagged with this theme in the Theme Tracker.')
      })
      .catch(err => { if (err?.name !== 'AbortError') setError('Could not load theme performance.') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [hubUrl, theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (ctxMenu) setCtxMenu(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctxMenu, onClose])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

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
  const flash = (text: string) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1200)
  }
  const sendToChart = useCallback((sym: string) => {
    if (!ahkEnabled || !ahkUrl) {
      copyToClipboard(sym)
      flash(`Copied ${sym}`)
      return
    }
    // fireAhk copies the symbol itself when the bridge is down.
    fireAhk(sym, ahkUrl).then(ok => flash(ok ? `Sent ${sym} to chart` : `Copied ${sym}`))
  }, [ahkEnabled, ahkUrl])

  const asOfText = asOf ? new Date(asOf).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : ''
  const chip = pillColors(theme)

  const row = (m: ThemeMember) => {
    const flagged = flaggedSymbols.has(m.symbol)
    return (
      <tr key={m.symbol} className="border-b hover:bg-white/[0.03]" style={{ borderColor: 'var(--border-glass)' }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, symbol: m.symbol }) }}>
        <td className="w-px pl-3 pr-3 py-1 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <button type="button" title={`Add ${m.symbol} to watchlist`} aria-label={`Add ${m.symbol} to watchlist`}
              className="w-3 text-center font-bold leading-none" style={{ color: '#00e676', fontSize: 15 }}
              onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setCtxMenu({ x: r.left, y: r.bottom + 4, symbol: m.symbol }) }}>+</button>
            <button type="button" title={flagged ? `Unflag ${m.symbol}` : `Flag ${m.symbol}`} aria-label={flagged ? `Unflag ${m.symbol}` : `Flag ${m.symbol}`}
              aria-pressed={flagged} className="w-3 leading-none" style={{ color: flagged ? '#facc15' : 'var(--text-muted)' }}
              onClick={(e) => { e.stopPropagation(); toggleFlag(m.symbol) }}>{flagged ? '⚑' : '⚐'}</button>
            <span role="button" tabIndex={0} title={`Send ${m.symbol} to chart`}
              className="font-mono font-bold cursor-pointer hover:underline" style={{ color: '#f0a500' }}
              onClick={() => sendToChart(m.symbol)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sendToChart(m.symbol) } }}>{m.symbol}</span>
          </span>
        </td>
        <td className="px-2 py-1 truncate max-w-[220px]" style={{ color: 'var(--text-muted)' }} title={m.company}>{m.company}</td>
        {PERF_COLUMNS.map(c => (
          <td key={c.key} className="px-2 py-1 text-right font-mono text-xs tabular-nums" style={pctCellStyle(m[c.key])}>{fmtPct(m[c.key])}</td>
        ))}
      </tr>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={() => { setCtxMenu(null); onClose() }}>
      <div className="glass-panel rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded-full text-sm font-semibold" style={{ background: chip.background, color: chip.color, border: `1px solid ${chip.border}` }}>{theme}</span>
            {detail && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{detail.count} stocks · equal weight{asOfText ? ` · ${asOfText}` : ''}</span>}
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
                  <td className="pl-3 pr-2 py-1.5 font-semibold" style={{ color: 'var(--text-primary)' }} colSpan={2}>Theme average <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(large caps)</span></td>
                  {PERF_COLUMNS.map(c => (
                    <td key={c.key} className="px-2 py-1.5 text-right font-mono text-xs font-semibold tabular-nums" style={pctCellStyle(detail[c.key])}>{fmtPct(detail[c.key])}</td>
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
          Theme average = equal-weight average of the large caps' moves (each capped at ±300%, base price under $0.50 excluded). Rows show each stock's actual move. Click a ticker to send it to your chart; right-click for watchlists.
        </div>
      </div>

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 px-3.5 py-2 rounded-lg text-sm pointer-events-none"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid #f0a500' }} role="status">{toast}</div>
      )}

      {ctxMenu && (
        <div onClick={(e) => e.stopPropagation()}>
          <SymbolContextMenu x={ctxMenu.x} y={ctxMenu.y} symbol={ctxMenu.symbol} currentListId={null} onClose={() => setCtxMenu(null)} />
        </div>
      )}
    </div>,
    document.body,
  )
}
