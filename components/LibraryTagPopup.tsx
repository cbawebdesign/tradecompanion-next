"use client"

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { byKind, formatLibraryTime, hasTag, isSaved, type KindFilter, type LibraryItem, type LibraryState } from '@/lib/library'
import { KIND_OPTIONS, KindToggle, LibraryAvatar, StarButton, TitleLink } from './LibraryParts'
import { useIncrementalList } from '@/hooks/useIncrementalList'

/**
 * Click a tag chip → everything in the Library with that tag (spec section 6).
 * Works like a theme pill's popup: over the whole app, background dimmed,
 * about 80% of full size, scrolling inside.
 */
export function LibraryTagPopup({ tag, items, lib, onStar, onSelect, onClose }: {
  tag: string
  items: LibraryItem[]
  lib: LibraryState
  onStar: (item: LibraryItem) => void
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<KindFilter>('all')
  const tagged = useMemo(() => items.filter(i => hasTag(i, tag)), [items, tag])
  const shown = useMemo(() => byKind(tagged, kind), [tagged, kind])
  const { visible, sentinel, remaining } = useIncrementalList(shown)
  const videos = tagged.filter(i => i.kind === 'video').length
  const articles = tagged.length - videos

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div className="glass-panel rounded-lg flex flex-col" style={{ width: '80vw', height: '80vh', maxWidth: 1100 }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${tag} in the Library`}>
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <div className="text-lg min-w-0 truncate">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{tag}</span>
            <span style={{ color: 'var(--text-muted)' }}> · {plural(videos, 'video')} · {plural(articles, 'article')}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none px-1 hover:brightness-150" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="px-4 py-2 flex-shrink-0">
          <KindToggle value={kind} onChange={setKind} options={KIND_OPTIONS} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {visible.map(item => (
            <div key={item.id} onClick={() => onSelect(item.id)}
              className="flex items-center gap-3 px-4 py-2 border-b cursor-pointer hover:bg-white/[0.03]" style={{ borderColor: 'var(--border-glass)' }}>
              <LibraryAvatar item={item} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  {item.name} · <span className="tabular-nums">{formatLibraryTime(item.date ?? item.added)}</span>
                </div>
                <TitleLink item={item} onSelect={() => onSelect(item.id)} className="text-[15px]" />
              </div>
              <StarButton saved={isSaved(lib, item.id)} onClick={() => onStar(item)} />
            </div>
          ))}
          {remaining > 0 && <div ref={sentinel} className="py-3 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading more…</div>}
          {shown.length === 0 && (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No {kind === 'all' ? 'items' : `${kind}s`} with this tag.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
