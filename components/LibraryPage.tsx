"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLibraryData, useLibraryState } from '@/hooks/useLibrary'
import {
  UNDO_MS, byKind, clearAll, dismiss, embedUrl, feedItems, formatLibraryDate, formatLibraryTime,
  isSaved, plainSummary, restoreFeed, results, savedItems, setHiddenSources, sourceList, toggleSave, undismiss, visibleToolbar,
  type KindFilter, type LibraryItem, type LibraryState,
} from '@/lib/library'
import { PopOutButton } from './PopOutButton'
import { KIND_OPTIONS, KindToggle, LibraryAvatar, StarButton, TagChip, TitleLink } from './LibraryParts'
import { LibraryTagPopup } from './LibraryTagPopup'
import { LibraryCustomize } from './LibraryCustomize'
import { LibrarySources } from './LibrarySources'

/**
 * The Library tab — Justin's spec (11/19) and mockups, re-laid out per his
 * Library updates (11/21): the preview (the YouTube player plays in place)
 * across the top; under it the News feed, which works like the Alerts
 * timeline, on the left two-thirds and Saved on the right third. Search and
 * toolbar tags turn the feed into results across the whole archive. Sources
 * picks whose items reach the feed.
 */

// "Recently removed" restores anything removed this session (spec section 4):
// per window, not synced, cleared on reload.
type Removed = { item: LibraryItem; how: 'unsaved' | 'dismissed' }
let removedThisSession: Removed[] = []
const removedListeners = new Set<() => void>()
function pushRemoved(r: Removed) {
  removedThisSession = [r, ...removedThisSession.filter(x => x.item.id !== r.item.id)].slice(0, 50)
  removedListeners.forEach(l => l())
}
function dropRemoved(id: string) {
  removedThisSession = removedThisSession.filter(x => x.item.id !== id)
  removedListeners.forEach(l => l())
}
function useRemoved() {
  return useSyncExternalStore(
    (l) => { removedListeners.add(l); return () => { removedListeners.delete(l) } },
    () => removedThisSession, () => removedThisSession,
  )
}

type Toast = { id: number; text: string; undo: () => void }

export function LibraryPage({ isPopout = false }: { isPopout?: boolean }) {
  const { data, error, loading } = useLibraryData()
  const [lib, update] = useLibraryState()
  const items = useMemo(() => data?.items ?? [], [data])
  const tags = useMemo(() => data?.tags ?? [], [data])

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [popupTag, setPopupTag] = useState<string | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [savedTab, setSavedTab] = useState<'video' | 'article'>('video')
  const [showRemoved, setShowRemoved] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const feed = useMemo(() => feedItems(items, lib), [items, lib])
  const archiveMode = query.trim() !== '' || tag != null
  const list = useMemo(
    () => archiveMode ? results(items, { query, tag, kind }) : byKind(feed, kind),
    [archiveMode, items, query, tag, kind, feed],
  )
  const saved = useMemo(() => savedItems(items, lib), [items, lib])
  const savedVideos = saved.filter(i => i.kind === 'video')
  const savedArticles = saved.filter(i => i.kind === 'article')
  const toolbar = useMemo(() => visibleToolbar(lib, tags), [lib, tags])
  const removed = useRemoved()
  const sources = useMemo(() => sourceList(items), [items])
  // Only creators that have records count as "off" in the button label.
  const hiddenCount = useMemo(() => {
    const present = new Set([...sources.video, ...sources.article].map(e => e.key))
    return (lib.hiddenSources ?? []).filter(k => present.has(k)).length
  }, [sources, lib.hiddenSources])

  const selected = useMemo(
    () => items.find(i => i.id === selectedId) ?? list[0] ?? saved[0] ?? null,
    [items, selectedId, list, saved],
  )

  const showToast = useCallback((text: string, undo: () => void) => {
    clearTimeout(toastTimer.current)
    const id = Date.now()
    setToast({ id, text, undo })
    toastTimer.current = setTimeout(() => setToast(t => (t?.id === id ? null : t)), UNDO_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const onDismiss = (item: LibraryItem) => {
    update(s => dismiss(s, item.id))
    pushRemoved({ item, how: 'dismissed' })
    showToast('Removed from feed', () => { update(s => undismiss(s, item.id)); dropRemoved(item.id) })
  }

  const onStar = (item: LibraryItem) => {
    if (isSaved(lib, item.id)) {
      update(s => toggleSave(s, item.id))
      pushRemoved({ item, how: 'unsaved' })
      showToast('Removed from Saved', () => {
        update(s => (isSaved(s, item.id) ? s : toggleSave(s, item.id)))
        dropRemoved(item.id)
      })
    } else {
      update(s => toggleSave(s, item.id))
      dropRemoved(item.id)
    }
  }

  const onClearAll = () => {
    if (feed.length === 0) return
    const before: LibraryState = { clearedAt: lib.clearedAt, dismissed: lib.dismissed }
    const n = feed.length
    update(s => clearAll(s, items))
    showToast(`Cleared ${n}`, () => update(s => restoreFeed(s, before)))
  }

  const restore = (r: Removed) => {
    if (r.how === 'unsaved') update(s => (isSaved(s, r.item.id) ? s : toggleSave(s, r.item.id)))
    else update(s => undismiss(s, r.item.id))
    dropRemoved(r.item.id)
  }

  const backToLatest = () => { setQuery(''); setTag(null) }

  return (
    <div className="h-full flex flex-col relative" style={{ background: 'var(--bg-base)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2 pt-2 flex-shrink-0">
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" width="12" height="12" viewBox="0 0 16 16" aria-hidden
            fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: 'var(--text-muted)' }}><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Search videos & articles… (title, creator, summary, $TICKER)"
            className="glass-input text-[color:var(--text-primary)] w-full pl-6 pr-2 py-1 text-sm rounded-md" aria-label="Search the Library" />
        </div>
        <KindToggle value={kind} onChange={setKind} options={KIND_OPTIONS} />
        {!isPopout && <PopOutButton route="/pop/library" title="Library" width={1100} height={800} />}
      </div>

      {/* Tag toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0 overflow-x-auto border-b" style={{ borderColor: 'var(--border-glass)' }}>
        {toolbar.map(t => (
          <button key={t} type="button" onClick={() => setTag(cur => (cur === t ? null : t))}
            className="px-2 py-0.5 rounded-full text-[13px] whitespace-nowrap"
            style={tag === t
              ? { background: 'var(--accent-primary)', color: '#fff', border: '1px solid var(--accent-primary)' }
              : { background: 'var(--bg-glass-light)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}>
            {t}
          </button>
        ))}
        <button type="button" onClick={() => setCustomizing(true)}
          className="px-2 py-0.5 rounded-full text-[13px] whitespace-nowrap"
          style={{ color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}>⚙ Customize</button>
      </div>

      {/* Top: preview */}
      <div className="lib-preview border-b" style={{ flex: '0 0 50%', borderColor: 'var(--border-glass)' }}>
        <Preview item={selected} saved={selected ? isSaved(lib, selected.id) : false} onStar={() => selected && onStar(selected)} />
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Bottom left: News feed */}
        <section className="flex flex-col min-w-0 border-r" style={{ flex: '2 1 0', borderColor: 'var(--border-glass)' }}>
          <div className="flex items-center justify-between px-3 py-1.5 text-sm flex-shrink-0 border-b" style={{ borderColor: 'var(--border-glass)', color: 'var(--text-secondary)' }}>
            {archiveMode ? (
              <>
                <span className="truncate">{list.length} result{list.length === 1 ? '' : 's'}{tag ? ` · ${tag}` : ''}{query.trim() ? ` · “${query.trim()}”` : ''}</span>
                <button type="button" onClick={backToLatest} className="hover:underline flex-shrink-0" style={{ color: 'var(--accent-primary)' }}>Back to latest</button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-3 min-w-0">
                  <span className="whitespace-nowrap">{feed.length} new</span>
                  <button type="button" onClick={() => setSourcesOpen(true)}
                    className="px-2 py-0.5 rounded-full text-[13px] whitespace-nowrap"
                    title="Pick whose videos and articles show up in your feed"
                    style={{ color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}>
                    Sources{hiddenCount > 0 ? ` · ${hiddenCount} off` : ''}
                  </button>
                </span>
                <button type="button" onClick={onClearAll} disabled={feed.length === 0} className="hover:underline disabled:opacity-40 disabled:no-underline">Clear all</button>
              </>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map(item => (
              <div key={item.id} onClick={() => setSelectedId(item.id)}
                className="flex items-center gap-2 px-2 py-1.5 border-b cursor-pointer hover:bg-white/[0.03]"
                style={{
                  borderColor: 'var(--border-glass)',
                  borderLeft: `2px solid ${selected?.id === item.id ? 'var(--accent-primary)' : 'transparent'}`,
                  background: selected?.id === item.id ? 'var(--accent-glow)' : undefined,
                }}>
                <LibraryAvatar item={item} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px] min-w-0" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate max-w-[40%]">{item.name}</span>
                    <span>·</span>
                    <span className="whitespace-nowrap tabular-nums">{formatLibraryTime(item.date ?? item.added)}</span>
                    <span className="flex items-center gap-1 min-w-0 overflow-hidden">
                      {item.tags.slice(0, 2).map(t => <TagChip key={t} tag={t} onClick={setPopupTag} />)}
                      {item.tags.length > 2 && <span title={item.tags.slice(2).join(', ')}>+{item.tags.length - 2}</span>}
                    </span>
                  </div>
                  <TitleLink item={item} onSelect={() => setSelectedId(item.id)} className="text-[15px]" />
                </div>
                {!archiveMode && (
                  <button type="button" aria-label="Remove from feed" title="Remove from feed"
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06] text-base"
                    style={{ color: '#f87171' }}
                    onClick={(e) => { e.stopPropagation(); onDismiss(item) }}>✕</button>
                )}
                <StarButton saved={isSaved(lib, item.id)} onClick={() => onStar(item)} />
              </div>
            ))}
            {list.length === 0 && (
              <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                {loading ? 'Loading the Library…'
                  : error && items.length === 0 ? error
                  : archiveMode ? 'Nothing matches.'
                  : items.length === 0 ? 'The Library is empty for now.'
                  : 'All caught up. New videos and articles show up here as they arrive.'}
              </div>
            )}
          </div>
        </section>

        {/* Bottom right: Saved */}
        <aside className="flex flex-col min-w-0" style={{ flex: '1 1 0' }}>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-3 pt-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Saved</div>
            <div className="flex gap-4 px-3 text-sm border-b flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
              {([['video', `Videos (${savedVideos.length})`], ['article', `Articles (${savedArticles.length})`]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setSavedTab(k)} className="py-1.5 -mb-px"
                  style={savedTab === k
                    ? { color: 'var(--text-primary)', borderBottom: '2px solid var(--text-primary)' }
                    : { color: 'var(--text-muted)', borderBottom: '2px solid transparent' }}>{label}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {(savedTab === 'video' ? savedVideos : savedArticles).map(item => (
                <div key={item.id} onClick={() => setSelectedId(item.id)}
                  className="flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-white/[0.03]">
                  <LibraryAvatar item={item} size={24} />
                  <div className="flex-1 min-w-0">
                    <TitleLink item={item} onSelect={() => setSelectedId(item.id)} className="text-sm" />
                    <div className="flex items-center gap-1.5 text-[13px] min-w-0" style={{ color: 'var(--text-muted)' }}>
                      <span className="truncate">{item.name}</span>
                      {item.tags[0] && <TagChip tag={item.tags[0]} onClick={setPopupTag} />}
                    </div>
                  </div>
                  <StarButton saved onClick={() => onStar(item)} size="text-base" />
                </div>
              ))}
              {(savedTab === 'video' ? savedVideos : savedArticles).length === 0 && (
                <div className="px-3 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Nothing saved yet. ☆ a {savedTab === 'video' ? 'video' : 'article'} to keep it here.
                </div>
              )}
            </div>
            <div className="px-3 py-1.5 flex-shrink-0 relative">
              <button type="button" onClick={() => setShowRemoved(v => !v)} disabled={removed.length === 0}
                className="text-[13px] underline disabled:no-underline disabled:opacity-40" style={{ color: 'var(--text-muted)' }}>
                Recently removed{removed.length ? ` (${removed.length})` : ''}
              </button>
              {showRemoved && removed.length > 0 && (
                <div className="absolute bottom-full left-2 right-2 mb-1 glass-panel rounded-md max-h-64 overflow-y-auto z-20">
                  {removed.map(r => (
                    <div key={r.item.id} className="flex items-center gap-2 px-2 py-1 text-sm border-b" style={{ borderColor: 'var(--border-glass)' }}>
                      <LibraryAvatar item={r.item} size={20} />
                      <span className="flex-1 truncate" title={r.item.title}>{r.item.title}</span>
                      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{r.how === 'unsaved' ? 'from Saved' : 'from feed'}</span>
                      <button type="button" onClick={() => restore(r)} className="hover:underline" style={{ color: 'var(--accent-primary)' }}>Restore</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full text-base glass-panel"
          style={{ border: '1px solid var(--accent-primary)', boxShadow: '0 0 20px var(--accent-glow)' }} role="status">
          <span style={{ color: 'var(--text-primary)' }}>{toast.text}</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <button type="button" className="underline" style={{ color: 'var(--library-link, #34d399)' }}
            onClick={() => { toast.undo(); setToast(null) }}>Undo</button>
        </div>
      )}

      {popupTag && (
        <LibraryTagPopup tag={popupTag} items={items} lib={lib}
          onStar={onStar}
          onSelect={(id) => { setSelectedId(id); setPopupTag(null) }}
          onClose={() => setPopupTag(null)} />
      )}
      {sourcesOpen && (
        <LibrarySources sources={sources} hidden={lib.hiddenSources ?? []}
          onSave={(hidden) => { update(s => setHiddenSources(s, hidden, items)); setSourcesOpen(false) }}
          onClose={() => setSourcesOpen(false)} />
      )}
      {customizing && (
        <LibraryCustomize tags={tags} lib={lib}
          onSave={(toolbarTags) => {
            // A saved tag hidden only because it has no records right now stays
            // saved, so it comes back by itself when records use it again.
            const inUse = new Set(tags.map(t => t.tag.toLowerCase()))
            update(s => ({ ...s, toolbarTags: [...toolbarTags, ...(s.toolbarTags ?? []).filter(t => !inUse.has(t.toLowerCase()))] }))
            setCustomizing(false)
          }}
          onReset={() => { update(s => { const { toolbarTags: _drop, ...rest } = s; return rest }); setCustomizing(false) }}
          onClose={() => setCustomizing(false)} />
      )}
    </div>
  )
}

/**
 * Top pane. Videos: the thumbnail until clicked, then the official
 * YouTube player in place (it never leaves TC). Articles: the image and the
 * summary; the image opens the article. The title opens the source in a new
 * window either way. There is no Open button (spec section 3).
 */
function Preview({ item, saved, onStar }: { item: LibraryItem | null; saved: boolean; onStar: () => void }) {
  const [playing, setPlaying] = useState<string | null>(null)
  if (!item) {
    return <div className="h-full flex items-center justify-center p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Pick a video or article to preview it here.</div>
  }
  const isVideo = item.kind === 'video'
  const isPlaying = isVideo && playing === item.id && item.youtubeId
  const openSource = () => { if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer') }
  const summary = !isVideo ? plainSummary(item.summary) : ''

  return (
    <div className="lib-preview-body">
      {/* An article with no image skips the frame, so its summary sits right under the title. */}
      {(isVideo || item.thumbnail) && (
      <div className="lib-preview-media relative rounded-md overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#000' }}>
        {isPlaying ? (
          <iframe key={item.id} src={embedUrl(item.youtubeId!)} title={item.title}
            className="absolute inset-0 w-full h-full" frameBorder={0}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        ) : (
          <button type="button" className="absolute inset-0 w-full h-full group"
            onClick={() => (isVideo && item.youtubeId ? setPlaying(item.id) : openSource())}
            aria-label={isVideo ? 'Play video' : 'Open article'}>
            {item.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>{isVideo ? 'No thumbnail' : 'No image'}</span>}
            {isVideo && item.youtubeId && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-12 h-12 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform" style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M8 5v14l11-7z" fill="#fff" /></svg>
                </span>
              </span>
            )}
          </button>
        )}
      </div>
      )}
      <div className="lib-preview-details">
      <div className="flex items-start gap-2">
        <a href={item.link ?? undefined} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-base font-semibold underline underline-offset-2 hover:brightness-125"
          style={{ color: 'var(--library-link, #34d399)' }}>{item.title}</a>
        <StarButton saved={saved} onClick={onStar} />
      </div>
      <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
        {[item.name, isVideo ? 'YouTube' : 'Substack', formatLibraryDate(item.date ?? item.added)].filter(Boolean).join(' · ')}
      </div>
      {item.tickers.length > 0 && (
        <div className="text-[13px] mt-1 font-mono" style={{ color: 'var(--text-secondary)' }}>{item.tickers.map(t => `$${t}`).join(' ')}</div>
      )}
      {summary && <p className="text-sm mt-2 whitespace-pre-line leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{summary}</p>}
      </div>
    </div>
  )
}
