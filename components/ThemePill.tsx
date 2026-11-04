"use client"

import { fmtPct, pctChangeClass, pillColors } from '@/lib/themePerformance'

/**
 * One theme pill. Shared by the Data Ribbon and the starred themes on the
 * Flagged list, so the two always look the same.
 *
 * The name keeps its own hashed colour ("Convenience Economy" is the same
 * colour on every symbol); only the % takes the green/red the watchlists use.
 * Justin (11/4): "'Convenience Economy' would still be the same color ... but
 * the '+5.7%' of the pill would display in green."
 */
export function ThemePill({ theme, today, count, onClick, title }: {
  theme: string
  today?: number | null
  count?: number | null
  onClick: () => void
  title?: string
}) {
  const c = pillColors(theme)
  return (
    <button type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="inline-flex items-center gap-1 px-1.5 rounded-full text-[11px] font-medium leading-[18px] hover:brightness-125"
      style={{ background: c.background, color: c.color, border: `1px solid ${c.border}` }}
      title={title ?? `${theme}${count ? ` · ${count} stocks` : ''} — click for performance`}>
      {theme}
      {today != null && <span className={`font-mono ${pctChangeClass(today)}`}>{fmtPct(today)}</span>}
    </button>
  )
}
