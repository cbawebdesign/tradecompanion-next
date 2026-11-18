"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store/useStore'
import { SymbolContextMenu } from './SymbolContextMenu'
import { ChartToast, ThemeSymbolCell, useSendToChart } from './ThemeSymbolCell'
import {
  COLUMN_SCALE, PERF_COLUMNS, SESSION_LABEL, fetchThemeDetail, fetchThemeReport, fmtPct, pctCellStyle,
  pctChangeClass, sortMembersBy, sortThemeRows,
  type ThemeMember, type ThemeReport, type ThemeSortKey,
} from '@/lib/themePerformance'

/**
 * The Themes report — Justin's "Themes Report — Build Criteria" (11/17) and his
 * Theme Performance sample. Every theme with a stock in the TC Large Caps view:
 * Today / 1W / 1M / 3M / 6M / YTD, Cap-weighted, heat-mapped, Top Mover. Click
 * a theme to open its stocks; the stock rows are the pill popup's ([+] [flag]
 * TICKER, company in grey) so the two feel like one app.
 *
 * Built on each press (fresh prices); a theme's stocks are fetched the first
 * time it is opened, not all ~3,000 up front.
 */
type MemberState = ThemeMember[] | 'loading' | 'error'

const COMPANY_GREY = '#8a8f98'

export function ThemesReport({ onClose }: { onClose: () => void }) {
  const hubUrl = useStore(s => s.config.hubUrl)
  const { sendToChart, toast } = useSendToChart()

  const [report, setReport] = useState<ThemeReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [sortKey, setSortKey] = useState<ThemeSortKey>('today')
  const [sortDesc, setSortDesc] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<Map<string, MemberState>>(new Map())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; symbol: string } | null>(null)

  // A theme's stocks are fetched the first time it is opened. One controller for
  // all of them, aborted when the report closes.
  const membersCtrl = useRef(new AbortController())
  useEffect(() => () => membersCtrl.current.abort(), [])
  const loadMembers = useCallback((theme: string) => {
    setMembers(m => new Map(m).set(theme, 'loading'))
    fetchThemeDetail(hubUrl, theme, membersCtrl.current.signal)
      .then(({ theme: t }) => setMembers(m => new Map(m).set(theme,
        // The report is the TC Large Caps view only; small caps stay in the pill popup.
        (t?.members ?? []).filter(x => x.cap !== 'small'))))
      .catch(err => { if (err?.name !== 'AbortError') setMembers(m => new Map(m).set(theme, 'error')) })
  }, [hubUrl])

  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true); setError('')
    fetchThemeReport(hubUrl, ctrl.signal)
      .then(r => {
        setReport(r)
        // Themes left open across a refresh are re-read so their stocks match the new numbers.
        setMembers(new Map())
        Array.from(openRef.current).forEach(loadMembers)
        if (r.themes.length === 0) setError('No themes have a stock in the TC Large Caps view.')
      })
      .catch(err => { if (err?.name !== 'AbortError') setError('Could not load the Themes report.') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [hubUrl, reloadKey, loadMembers])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (ctxMenu) setCtxMenu(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctxMenu, onClose])

  const rows = useMemo(() => sortThemeRows(report?.themes ?? [], sortKey, sortDesc), [report, sortKey, sortDesc])

  const onSort = (key: ThemeSortKey) => {
    if (key === sortKey) setSortDesc(d => !d)
    // Theme starts A–Z; the numbers start biggest first.
    else { setSortKey(key); setSortDesc(key !== 'theme') }
  }

  const toggle = (theme: string) => {
    const n = new Set(open)
    if (n.has(theme)) n.delete(theme)
    else {
      n.add(theme)
      if (!members.has(theme) || members.get(theme) === 'error') loadMembers(theme)
    }
    setOpen(n)
  }

  const asOf = report?.asOfUtc ? new Date(report.asOfUtc) : null
  const asOfText = asOf && asOf.getFullYear() > 2000
    ? asOf.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET · '
      + asOf.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    : ''

  const header = (key: ThemeSortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th key={key} className={`px-2 py-1.5 font-semibold cursor-pointer select-none whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}
      style={{ color: sortKey === key ? 'var(--text-primary)' : undefined }}
      onClick={() => onSort(key)} title={`Sort by ${label}`}>
      {label}{sortKey === key ? (sortDesc ? ' ▾' : ' ▴') : ''}
    </th>
  )

  const colSpan = 2 + PERF_COLUMNS.length

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={() => { setCtxMenu(null); onClose() }}>
      <div className="glass-panel rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Theme Performance</h2>
            {asOfText && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Last updated {asOfText}</span>}
            {report?.session && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold self-center"
                style={{ background: 'rgba(240,165,0,0.15)', color: '#f0a500', border: '1px solid rgba(240,165,0,0.4)' }}>
                {SESSION_LABEL[report.session]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="text-xs hover:underline disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}
              disabled={loading} onClick={() => setReloadKey(k => k + 1)} title="Fetch current prices">↻ Refresh</button>
            <button className="text-xl leading-none" style={{ color: 'var(--text-muted)' }} onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && !report && <div className="p-5 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>Loading themes…</div>}
          {!loading && error && <div className="p-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>{error}</div>}
          {report && rows.length > 0 && (
            <table className="w-full text-sm" style={{ opacity: loading ? 0.6 : 1 }}>
              <thead className="sticky top-0 z-10 text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                <tr>
                  {header('theme', 'Theme', 'left')}
                  {PERF_COLUMNS.map(c => header(c.key, c.label))}
                  {header('top', 'Top Mover', 'left')}
                </tr>
              </thead>
              <tbody>
                {rows.map(t => {
                  const isOpen = open.has(t.theme)
                  const ms = members.get(t.theme)
                  return (
                    <Fragment key={t.theme}>
                      <tr className="border-b cursor-pointer hover:bg-white/[0.03]" style={{ borderColor: 'var(--border-glass)' }}
                        onClick={() => toggle(t.theme)} aria-expanded={isOpen}>
                        <td className="pl-3 pr-2 py-1 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          <span className="inline-block w-4 text-xs" style={{ color: 'var(--text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
                          {t.theme}
                          <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.large ?? t.count}</span>
                        </td>
                        {PERF_COLUMNS.map(c => (
                          <td key={c.key} className="px-2 py-1 text-right font-mono text-xs tabular-nums" style={pctCellStyle(t[c.key], COLUMN_SCALE[c.key])}>{fmtPct(t[c.key])}</td>
                        ))}
                        <td className="px-2 py-1 whitespace-nowrap text-xs font-mono">
                          {t.topSymbol ? (
                            <>
                              <span role="button" tabIndex={0} className="font-bold cursor-pointer hover:underline" style={{ color: '#f0a500' }}
                                title={`Send ${t.topSymbol} to chart`}
                                onClick={(e) => { e.stopPropagation(); sendToChart(t.topSymbol!) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); sendToChart(t.topSymbol!) } }}>{t.topSymbol}</span>
                              {' '}<span className={pctChangeClass(t.topToday)}>{fmtPct(t.topToday)}</span>
                            </>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      </tr>
                      {isOpen && (ms === 'loading' || ms === undefined) && (
                        <tr><td colSpan={colSpan} className="pl-8 py-1.5 text-xs italic" style={{ color: 'var(--text-muted)' }}>Loading stocks…</td></tr>
                      )}
                      {isOpen && ms === 'error' && (
                        <tr><td colSpan={colSpan} className="pl-8 py-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>Could not load this theme&apos;s stocks.</td></tr>
                      )}
                      {isOpen && Array.isArray(ms) && sortMembersBy(ms, sortKey, sortDesc).map(m => (
                        <tr key={m.symbol} className="border-b hover:bg-white/[0.03]"
                          style={{ borderColor: 'var(--border-glass)', background: 'rgba(255,255,255,0.015)' }}
                          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, symbol: m.symbol }) }}>
                          <td className="pl-7 pr-2 py-1 max-w-[340px]">
                            <span className="flex items-center gap-2 min-w-0">
                              <ThemeSymbolCell symbol={m.symbol} onChart={sendToChart}
                                onAdd={(r) => setCtxMenu({ x: r.left, y: r.bottom + 4, symbol: m.symbol })} />
                              {m.company && (
                                <span className="truncate text-[11px] min-w-0" style={{ color: COMPANY_GREY }} title={m.company}>{m.company}</span>
                              )}
                            </span>
                          </td>
                          {PERF_COLUMNS.map(c => (
                            <td key={c.key} className="px-2 py-1 text-right font-mono text-xs tabular-nums" style={pctCellStyle(m[c.key], COLUMN_SCALE[c.key])}>{fmtPct(m[c.key])}</td>
                          ))}
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-1.5 text-[11px] border-t flex-shrink-0" style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }}>
          {rows.length > 0 && `${rows.length} themes · `}TC Large Caps. Each theme is weighted by Cap (Float × Price), no stock above 25%; ETF is equal weight. Stocks with a base price under $0.50 are left out of that column. Click a theme for its stocks, a ticker to send it to your chart.
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
