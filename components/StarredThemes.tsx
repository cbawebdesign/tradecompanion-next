"use client"

import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { fetchThemeBoard, type SymbolTheme } from '@/lib/themePerformance'
import { ThemePill } from './ThemePill'
import { ThemePopup } from './ThemePopup'

const REFRESH_MS = 60 * 1000

/**
 * Starred themes as pills on the Flagged list.
 *
 * Justin (11/4): "The biggest thing is the main flagged list screen would be
 * able to display the symbols the user is most interested in (flagged list)
 * along with the themes they want to keep an eye on." Same pills as the Data
 * Ribbon, no star on them — "don't display the star on the main UI but if the
 * user clicks on the pill they would get the full report screen and from there
 * they can unstar the theme."
 *
 * Today's % refreshes once a minute, one request for every starred theme:
 * "an every minute refresh of saved themes ... so TC doesn't get bogged down."
 * Nothing is fetched at all when nothing is starred.
 */
export function StarredThemes() {
  const hubUrl = useStore(s => s.config.hubUrl)
  const starred = useStore(s => s.config.starredThemes) ?? []
  const [board, setBoard] = useState<Map<string, SymbolTheme>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const any = starred.length > 0

  useEffect(() => {
    if (!any) return
    let ctrl = new AbortController()
    const load = () => {
      ctrl.abort()
      ctrl = new AbortController()
      // A failed refresh keeps the last numbers on screen rather than blanking
      // them; they are a minute old at worst.
      fetchThemeBoard(hubUrl, ctrl.signal).then(setBoard).catch(() => {})
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { clearInterval(id); ctrl.abort() }
  }, [hubUrl, any])

  // Rendered whether or not anything is starred: unstarring the LAST theme
  // happens inside this popup, and it must not vanish out from under him.
  const popup = open && <ThemePopup theme={open} onClose={() => setOpen(null)} />

  if (!any) return <>{popup}</>

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      <span className="text-[10px] uppercase tracking-wide mr-0.5" style={{ color: 'var(--text-muted)' }}>Themes</span>
      {starred.map(name => {
        const b = board.get(name.toLowerCase())
        return (
          <ThemePill key={name} theme={b?.theme ?? name} today={b?.today} count={b?.count}
            onClick={() => setOpen(name)}
            // A theme renamed or emptied in the Theme Tracker drops off the
            // board. It stays here regardless — the popup is the only place to
            // unstar it, so hiding it would make it impossible to remove.
            title={b ? undefined : `${name} — not in the Theme Tracker right now. Click to open or unstar.`} />
        )
      })}
      {popup}
    </div>
  )
}
