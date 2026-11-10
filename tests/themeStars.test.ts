import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pctChangeClass, isThemeStarred, toggleThemeStar } from '../lib/themePerformance'
import { WEBCONFIG_DENYLIST } from '../lib/syncPayload'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('pill % colour', () => {
  it('uses the same classes as the watchlists and Flagged list', () => {
    expect(pctChangeClass(5.7)).toBe('price-up')
    expect(pctChangeClass(-2.1)).toBe('price-down')
    expect(pctChangeClass(0)).toBe('price-neutral')
  })

  it('judges the value as displayed, so "0.0%" is never red or green', () => {
    // fmtPct rounds to one decimal; a -0.04 prints "0.0%".
    expect(pctChangeClass(-0.04)).toBe('price-neutral')
    expect(pctChangeClass(0.04)).toBe('price-neutral')
    expect(pctChangeClass(0.05)).toBe('price-up')
  })

  it('leaves a missing value uncoloured', () => {
    expect(pctChangeClass(null)).toBe('')
    expect(pctChangeClass(undefined)).toBe('')
    expect(pctChangeClass(NaN)).toBe('')
  })

  it('those classes really exist in globals.css', () => {
    const css = read('app', 'globals.css')
    for (const c of ['.price-up', '.price-down', '.price-neutral']) expect(css).toContain(c)
  })

  it('the ribbon and the Flagged list render the same pill', () => {
    // One component, so the two can't drift apart.
    expect(read('components', 'ThemePills.tsx')).toContain('<ThemePill ')
    expect(read('components', 'StarredThemes.tsx')).toContain('<ThemePill ')
    expect(read('components', 'ThemePill.tsx')).toContain('pctChangeClass(today)')
  })
})

describe('starring themes', () => {
  it('stars and unstars, keeping the order he starred them in', () => {
    let s = toggleThemeStar(undefined, 'Datacenters')
    s = toggleThemeStar(s, 'Convenience Economy')
    s = toggleThemeStar(s, 'Uranium')
    expect(s).toEqual(['Datacenters', 'Convenience Economy', 'Uranium'])
    expect(toggleThemeStar(s, 'Convenience Economy')).toEqual(['Datacenters', 'Uranium'])
  })

  it('matches case-insensitively, like the worker does', () => {
    expect(isThemeStarred(['Datacenters'], 'datacenters')).toBe(true)
    // Unstarring a differently-cased name must not leave a duplicate behind.
    expect(toggleThemeStar(['Datacenters'], 'DataCenters')).toEqual([])
  })

  it('handles nothing starred', () => {
    expect(isThemeStarred(undefined, 'X')).toBe(false)
    expect(isThemeStarred([], 'X')).toBe(false)
  })

  it('the star lives in the popup, not on the pills', () => {
    // "don't display the star on the main UI"
    expect(read('components', 'ThemePopup.tsx')).toContain('toggleStar')
    expect(read('components', 'ThemePill.tsx')).not.toMatch(/[★☆]/)
    expect(read('components', 'StarredThemes.tsx')).not.toMatch(/[★☆]/)
  })

  it('keeps the popup mounted after the last theme is unstarred', () => {
    // Unstarring the last one happens INSIDE the popup the strip owns.
    expect(read('components', 'StarredThemes.tsx')).toContain('if (!any) return <>{popup}</>')
  })

  it('syncs to the server — it is not on the webConfig denylist', () => {
    // A setting left off the sync path is lost on the next forced re-login,
    // which is the "all my settings are gone" bug. starredThemes rides the
    // webConfig blob, so it must never be added to the denylist.
    expect(WEBCONFIG_DENYLIST.size).toBeGreaterThan(0)
    expect(WEBCONFIG_DENYLIST.has('starredThemes')).toBe(false)
  })
})

describe('fetchThemeBoard', () => {
  beforeEach(() => { vi.resetModules() })

  it('keys every theme by lower-cased name, from one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ themes: [
        { theme: 'Convenience Economy', count: 12, today: 5.7 },
        { theme: 'Uranium', count: 8, today: -1.2 },
      ] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchThemeBoard } = await import('../lib/themePerformance')
    const board = await fetchThemeBoard('https://x/api')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/ThemePerformance')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('theme=')
    expect(board.get('convenience economy')?.today).toBe(5.7)
    expect(board.get('uranium')?.today).toBe(-1.2)
    vi.unstubAllGlobals()
  })

  it('does not cache an empty board', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ themes: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchThemeBoard } = await import('../lib/themePerformance')
    await fetchThemeBoard('https://x/api')
    await fetchThemeBoard('https://x/api')
    // An empty answer straight after a worker restart is a blip.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })
})
