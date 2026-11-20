/**
 * The Library tab — Justin's spec ("Trade Companion — Library tab", 11/19):
 * curated YouTube videos and Substack articles from his YouTube TC and
 * Substack TC Airtable bases, served merged by the worker at /api/Library.
 *
 * Everything here is pure so the rules can be tested without a browser.
 *
 * Per-user state (saved, cleared, toolbar tags) lives in config.library, so it
 * rides the webConfig blob like starredThemes: saved to the login's server
 * document and pushed live to every open session and pop-out.
 */

export type LibraryKind = 'video' | 'article'
export type KindFilter = 'all' | LibraryKind

export interface LibraryItem {
  id: string              // "v:recXXX" | "a:recXXX"
  kind: LibraryKind
  name: string            // creator
  date: string | null     // ISO (the Date field)
  added: string           // ISO (when the record was created in Airtable)
  title: string
  link: string | null
  youtubeId: string | null
  tags: string[]
  thumbnail: string | null
  avatar: string | null
  summary: string | null
  tickers: string[]
}

export interface TagCount { tag: string; count: number }

export interface LibraryData {
  asOfUtc: string
  items: LibraryItem[]
  tags: TagCount[]
}

export interface LibraryState {
  /** Feed begins here: the first open minus 7 days (spec: "the first time a user
   *  opens TC, the News feed loads every new item from the past 7 days"). */
  feedStart?: string
  /** Clear all: every item added to Airtable at or before this is cleared. It is
   *  the newest `added` the window had seen, not the clock, so a computer whose
   *  clock runs fast cannot hide items that arrive after the click. */
  clearedAt?: string
  /** Items dismissed one at a time since the last Clear all. */
  dismissed?: string[]
  /** Saved (★) item ids, most recently saved first. */
  saved?: string[]
  /** Toolbar tags in order. Unset means the default: the top 6 in-use tags. */
  toolbarTags?: string[]
}

export const FEED_DAYS = 7
export const DEFAULT_TOOLBAR_COUNT = 6
export const MAX_TOOLBAR_TAGS = 8
export const UNDO_MS = 8_000

const DAY_MS = 86_400_000

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/** A first open sets where the feed begins. */
export function ensureFeedStart(state: LibraryState | undefined, now: number): LibraryState {
  const s = state ?? {}
  return s.feedStart ? s : { ...s, feedStart: new Date(now - FEED_DAYS * DAY_MS).toISOString() }
}

/**
 * The News feed, newest first: items dated on or after the feed's start that
 * haven't been cleared. Membership is by Date (so an old video Justin back-fills
 * into the base doesn't land in everyone's feed as "new"); clearing is by when
 * the record was added (so a video dated yesterday but added after a Clear all
 * still shows up).
 */
export function feedItems(items: LibraryItem[], state: LibraryState | undefined): LibraryItem[] {
  const start = ms(state?.feedStart)
  const cleared = ms(state?.clearedAt)
  const dismissed = new Set(state?.dismissed ?? [])
  return items.filter(i => {
    if (dismissed.has(i.id)) return false
    const d = ms(i.date ?? i.added)
    if (!isNaN(start) && !(d >= start)) return false
    if (!isNaN(cleared) && ms(i.added) <= cleared) return false
    return true
  })
}

export function dismiss(state: LibraryState | undefined, id: string): LibraryState {
  const s = state ?? {}
  const dismissed = s.dismissed ?? []
  return dismissed.includes(id) ? s : { ...s, dismissed: [...dismissed, id] }
}

export function undismiss(state: LibraryState | undefined, id: string): LibraryState {
  const s = state ?? {}
  return { ...s, dismissed: (s.dismissed ?? []).filter(x => x !== id) }
}

/**
 * Clear all. Moves the watermark to the newest item seen and drops the
 * individual dismissals it now covers, so the synced document stays small
 * however long the Library is used.
 */
export function clearAll(state: LibraryState | undefined, items: LibraryItem[]): LibraryState {
  const s = state ?? {}
  let newest = ms(s.clearedAt)
  for (const i of items) { const a = ms(i.added); if (!(a <= newest)) newest = a }
  if (isNaN(newest)) return s
  const clearedAt = new Date(newest).toISOString()
  const byId = new Map(items.map(i => [i.id, i]))
  const dismissed = (s.dismissed ?? []).filter(id => {
    const it = byId.get(id)
    return it != null && ms(it.added) > newest
  })
  return { ...s, clearedAt, dismissed }
}

/** Undo a Clear all: restore the previous watermark and dismissals. */
export function restoreFeed(state: LibraryState | undefined, before: LibraryState | undefined): LibraryState {
  return { ...(state ?? {}), clearedAt: before?.clearedAt, dismissed: before?.dismissed ?? [] }
}

export function isSaved(state: LibraryState | undefined, id: string): boolean {
  return (state?.saved ?? []).includes(id)
}

export function toggleSave(state: LibraryState | undefined, id: string): LibraryState {
  const s = state ?? {}
  const saved = s.saved ?? []
  return saved.includes(id) ? { ...s, saved: saved.filter(x => x !== id) } : { ...s, saved: [id, ...saved] }
}

/** Drop ids that no longer exist in either base (a record deleted in Airtable). */
export function savedItems(items: LibraryItem[], state: LibraryState | undefined): LibraryItem[] {
  const byId = new Map(items.map(i => [i.id, i]))
  return (state?.saved ?? []).map(id => byId.get(id)).filter((i): i is LibraryItem => i != null)
}

/** The default toolbar: the most-used in-use tags (tags arrive sorted by count). */
export function defaultToolbar(tags: TagCount[]): string[] {
  return tags.slice(0, DEFAULT_TOOLBAR_COUNT).map(t => t.tag)
}

/**
 * The toolbar as shown: the user's tags (or the default) that are in use right
 * now. A saved tag that drops to zero records is hidden but kept, so it comes
 * back by itself if records use it again (spec section 7).
 */
export function visibleToolbar(state: LibraryState | undefined, tags: TagCount[]): string[] {
  const inUse = new Map(tags.map(t => [t.tag.toLowerCase(), t.tag]))
  const chosen = state?.toolbarTags ?? defaultToolbar(tags)
  const out: string[] = []
  for (const t of chosen) {
    const canon = inUse.get(t.toLowerCase())
    if (canon && !out.includes(canon)) out.push(canon)
  }
  return out.slice(0, MAX_TOOLBAR_TAGS)
}

export function hasTag(item: LibraryItem, tag: string): boolean {
  const t = tag.toLowerCase()
  return item.tags.some(x => x.toLowerCase() === t)
}

export function byKind(items: LibraryItem[], kind: KindFilter): LibraryItem[] {
  return kind === 'all' ? items : items.filter(i => i.kind === kind)
}

/**
 * Search across the whole archive: Title, creator, Summary and Tickers. Every
 * word must match somewhere. A symbol ("NVDA" or "$NVDA") matches the Tickers
 * field exactly; tickers are never parsed out of titles or summaries.
 */
export function search(items: LibraryItem[], query: string): LibraryItem[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return items
  return items.filter(i => {
    const hay = `${i.title}\n${i.name}\n${i.summary ?? ''}`.toLowerCase()
    return words.every(w => {
      const sym = w.replace(/^\$/, '').toUpperCase()
      if (sym && i.tickers.includes(sym)) return true
      if (w.startsWith('$')) return false   // "$NVDA" means the ticker, not the word
      return hay.includes(w.toLowerCase())
    })
  })
}

/** Results for an active search and/or tag, newest first, across the archive. */
export function results(items: LibraryItem[], opts: { query: string; tag: string | null; kind: KindFilter }): LibraryItem[] {
  let out = byKind(items, opts.kind)
  if (opts.tag) out = out.filter(i => hasTag(i, opts.tag!))
  return search(out, opts.query)
}

/**
 * Row time. Today: "08:00". Before today: "11/7/26 08:00" — M/D/YY, never a
 * weekday name (spec section 2). 24-hour, in the browser's zone like every
 * other TC timestamp.
 */
export function formatLibraryTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return time
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)} ${time}`
}

/** Preview line date: "Nov 14, 2026". */
export function formatLibraryDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * The official YouTube embed on youtube.com, not youtube-nocookie.com: the
 * nocookie domain is built not to use the viewer's YouTube cookies, which is
 * exactly what carries a Premium sign-in (ad-free) over from Chrome.
 */
export function embedUrl(youtubeId: string, autoplay = true): string {
  const p = new URLSearchParams({ rel: '0', playsinline: '1' })
  if (autoplay) p.set('autoplay', '1')
  return `https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}?${p}`
}

/** Airtable rich text arrives as Markdown. The preview shows it as plain
 *  paragraphs: markers stripped, links kept as their text. */
export function plainSummary(md: string | null | undefined): string {
  if (!md) return ''
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^*])\*(?!\s)([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
