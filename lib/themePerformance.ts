import { proxyUrl } from '@/lib/proxyUrl'

/**
 * Sectors & Themes from Justin's Theme Tracker (meeting 10/31). The worker reads
 * the Airtable base and computes the numbers (ThemeTrackerService); this is the
 * client side: fetching, sorting and the report's colour scale.
 *
 * Inline colours on purpose: Tailwind does not scan lib/, so class names built
 * here would be purged (see lib/alertTypeColor).
 */

export type PerfKey = 'today' | 'w1' | 'm1' | 'm3' | 'm6' | 'ytd'
export const PERF_COLUMNS: { key: PerfKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'w1', label: '1W' },
  { key: 'm1', label: '1M' },
  { key: 'm3', label: '3M' },
  { key: 'm6', label: '6M' },
  { key: 'ytd', label: 'YTD' },
]

export type Perf = Partial<Record<PerfKey, number | null>>

export interface ThemeMember extends Perf {
  symbol: string
  company: string
  cap: 'large' | 'small' | string
  last?: number | null
}

export interface ThemeDetail extends Perf {
  theme: string
  count: number
  members: ThemeMember[]
}

export interface SymbolTheme {
  theme: string
  count?: number | null
  today?: number | null
}

// 1 min, matching the worker's Airtable refresh. Justin (11/1): edits took
// ~5 min to show; with both caches at 5 min it could be nearer 10.
const SYMBOL_THEMES_TTL_MS = 60 * 1000
const symbolThemesCache = new Map<string, { at: number; themes: SymbolTheme[] }>()

/** The ribbon pills for one symbol. Cached 1 min (the worker's Airtable refresh). */
export async function fetchSymbolThemes(hubUrl: string, symbol: string, signal?: AbortSignal): Promise<SymbolTheme[]> {
  const key = symbol.toUpperCase()
  const hit = symbolThemesCache.get(key)
  if (hit && Date.now() - hit.at < SYMBOL_THEMES_TTL_MS) return hit.themes
  const r = await fetch(proxyUrl(`${apiBase(hubUrl)}/SymbolThemes?symbol=${encodeURIComponent(key)}`), { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  const themes: SymbolTheme[] = Array.isArray(data?.themes) ? data.themes : []
  // An empty answer is not cached: right after a server restart it can be a
  // blip, and caching it would show "No themes" for 5 minutes.
  if (themes.length > 0) symbolThemesCache.set(key, { at: Date.now(), themes })
  return themes
}

export async function fetchThemeDetail(hubUrl: string, theme: string, signal?: AbortSignal): Promise<{ asOfUtc?: string; theme: ThemeDetail | null }> {
  const r = await fetch(proxyUrl(`${apiBase(hubUrl)}/ThemePerformance?theme=${encodeURIComponent(theme)}`), { signal })
  if (r.status === 404) return { theme: null }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  return { asOfUtc: data?.asOfUtc, theme: data?.theme ?? null }
}

function apiBase(hubUrl: string): string {
  return hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'
}

/** "+1.7%" / "-0.4%" / "—", one decimal like Justin's report. */
export function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  const r = Math.round(v * 10) / 10
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}%`
}

/** Sort members by a column, missing values last either way. */
export function sortMembers(members: ThemeMember[], key: PerfKey, desc: boolean): ThemeMember[] {
  return [...members].sort((a, b) => {
    const av = a[key], bv = b[key]
    if (av == null && bv == null) return a.symbol.localeCompare(b.symbol)
    if (av == null) return 1
    if (bv == null) return -1
    return desc ? bv - av : av - bv
  })
}

/** Large caps open by default, small caps under the arrow (sympathy plays). */
export function splitByCap(members: ThemeMember[]): { large: ThemeMember[]; small: ThemeMember[] } {
  return {
    large: members.filter(m => m.cap !== 'small'),
    small: members.filter(m => m.cap === 'small'),
  }
}

/**
 * Cell background on the report's scale: green up, red down, stronger with size.
 * Saturates at ±scale percent. Tuned on dark themes, which is all TC has.
 */
export function pctCellStyle(v: number | null | undefined, scale = 25): { background?: string; color?: string } {
  if (v == null || Number.isNaN(v) || v === 0) return {}
  const t = Math.min(1, Math.abs(v) / scale)
  const alpha = 0.08 + t * 0.5
  return v > 0
    ? { background: `rgba(34, 197, 94, ${alpha.toFixed(3)})`, color: t > 0.6 ? '#ffffff' : '#4ade80' }
    : { background: `rgba(239, 68, 68, ${alpha.toFixed(3)})`, color: t > 0.6 ? '#ffffff' : '#f87171' }
}

/**
 * A stable Airtable-style chip colour per theme name, so "Datacenters" is the
 * same colour on every symbol. Hashed hue, pastel on dark.
 */
export function pillColors(theme: string): { background: string; color: string; border: string } {
  let h = 0
  for (let i = 0; i < theme.length; i++) h = (h * 31 + theme.charCodeAt(i)) >>> 0
  const hue = h % 360
  return {
    background: `hsla(${hue}, 70%, 55%, 0.16)`,
    color: `hsl(${hue}, 80%, 76%)`,
    border: `hsla(${hue}, 70%, 60%, 0.35)`,
  }
}
