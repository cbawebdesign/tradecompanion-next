"use client"

import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { fetchSymbolThemes, type SymbolTheme } from '@/lib/themePerformance'
import { ThemePopup } from './ThemePopup'
import { ThemePill } from './ThemePill'

/**
 * The symbol's themes from Justin's Theme Tracker, as Airtable-style pills.
 * Meeting 10/31: replaces the ribbon's manual Sector / Theme fields — "when a
 * symbol is selected, the system will query the theme tracker base in Air Table
 * and pull tagged items from the themes column". Click one for its popup.
 */
export function ThemePills({ symbol }: { symbol: string }) {
  const hubUrl = useStore(s => s.config.hubUrl)
  const [themes, setThemes] = useState<SymbolTheme[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setThemes(null)
    fetchSymbolThemes(hubUrl, symbol, ctrl.signal)
      .then(t => setThemes(t))
      .catch(err => { if (err?.name !== 'AbortError') setThemes([]) })
    return () => ctrl.abort()
  }, [hubUrl, symbol])

  // The popup renders whatever state the pills are in, so a reload of the pills
  // (the ribbon switching symbol) can never close it.
  const popup = open && <ThemePopup theme={open} focusSymbol={symbol} onClose={() => setOpen(null)} />

  if (themes === null) return <>{popup}</>
  if (themes.length === 0) {
    return <><span style={{ color: 'var(--text-muted)' }} title="Not tagged in the Theme Tracker">No themes</span>{popup}</>
  }

  return (
    <>
      {themes.map(t => (
        <ThemePill key={t.theme} theme={t.theme} today={t.today} count={t.count} onClick={() => setOpen(t.theme)} />
      ))}
      {popup}
    </>
  )
}
