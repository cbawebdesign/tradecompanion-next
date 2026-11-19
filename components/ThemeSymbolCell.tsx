"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { fireAhk } from '@/lib/ahk'
import { copyToClipboard } from '@/lib/clipboard'

/**
 * Click a ticker → AHK sends it to the chart (or it's copied when AHK is off),
 * with the short "Sent X to chart" confirmation. Shared by the theme pill popup
 * and the Themes report so the two behave the same.
 */
export function useSendToChart() {
  const ahkEnabled = useStore(s => s.config.ahkEnabled)
  const ahkUrl = useStore(s => s.config.ahkUrl)
  const [toast, setToast] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])

  const flash = useCallback((text: string) => {
    setToast(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(''), 1200)
  }, [])

  const sendToChart = useCallback((sym: string) => {
    if (!ahkEnabled || !ahkUrl) {
      copyToClipboard(sym)
      flash(`Copied ${sym}`)
      return
    }
    // fireAhk copies the symbol itself when the bridge is down.
    fireAhk(sym, ahkUrl).then(ok => flash(ok ? `Sent ${sym} to chart` : `Copied ${sym}`))
  }, [ahkEnabled, ahkUrl, flash])

  return { sendToChart, toast }
}

export function ChartToast({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="fixed left-1/2 bottom-6 -translate-x-1/2 px-3.5 py-2 rounded-lg text-sm pointer-events-none z-[60]"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid #f0a500' }} role="status">{text}</div>
  )
}

/**
 * [+] [flag] TICKER — the look of Justin's TickerText files. "+" opens the
 * watchlist menu, the flag toggles the Flagged list, the gold ticker goes to the
 * chart. Neither button reaches the row underneath (no chart, no collapse).
 */
export function ThemeSymbolCell({ symbol, onAdd, onChart }: {
  symbol: string
  onAdd: (anchor: DOMRect) => void
  onChart: (symbol: string) => void
}) {
  const flagged = useStore(s => s.flaggedSymbols.has(symbol))
  const toggleFlag = useStore(s => s.toggleFlag)
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" title={`Add ${symbol} to watchlist`} aria-label={`Add ${symbol} to watchlist`}
        className="w-3 text-center font-bold leading-none" style={{ color: '#00e676', fontSize: 15 }}
        onClick={(e) => { e.stopPropagation(); onAdd((e.currentTarget as HTMLElement).getBoundingClientRect()) }}>+</button>
      <button type="button" title={flagged ? `Unflag ${symbol}` : `Flag ${symbol}`} aria-label={flagged ? `Unflag ${symbol}` : `Flag ${symbol}`}
        aria-pressed={flagged} className="w-3 leading-none" style={{ color: flagged ? '#facc15' : 'var(--text-muted)' }}
        onClick={(e) => { e.stopPropagation(); toggleFlag(symbol) }}>{flagged ? '⚑' : '⚐'}</button>
      <span role="button" tabIndex={0} title={`Send ${symbol} to chart`}
        className="font-mono font-bold cursor-pointer hover:underline" style={{ color: '#f0a500' }}
        onClick={(e) => { e.stopPropagation(); onChart(symbol) }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChart(symbol) } }}>{symbol}</span>
    </span>
  )
}
