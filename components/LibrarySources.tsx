"use client"

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LibraryKind, SourceEntry } from '@/lib/library'

/**
 * Sources (Library updates 11/21, item 2): every creator with at least one
 * record in either base, A to Z, split into Videos and Articles. Unchecked
 * creators stay out of the feed. New creators are on by default. Saved to the
 * login's settings, which sync live to every open session.
 */
export function LibrarySources({ sources, hidden, onSave, onClose }: {
  sources: Record<LibraryKind, SourceEntry[]>
  hidden: string[]
  onSave: (hidden: string[]) => void
  onClose: () => void
}) {
  const [off, setOff] = useState<Set<string>>(() => new Set(hidden))
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filter = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (list: SourceEntry[]) => (s ? list.filter(e => e.name.toLowerCase().includes(s)) : list)
  }, [q])

  const toggle = (key: string) => setOff(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const setAll = (list: SourceEntry[], on: boolean) => setOff(prev => {
    const next = new Set(prev)
    for (const e of list) { if (on) next.delete(e.key); else next.add(e.key) }
    return next
  })

  const present = [...sources.video, ...sources.article]
  const save = () => onSave(present.filter(e => off.has(e.key)).map(e => e.key))

  const section = (label: string, all: SourceEntry[]) => {
    const list = filter(all)
    const onCount = all.filter(e => !off.has(e.key)).length
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between py-1.5 border-b sticky top-0 z-10" style={{ borderColor: 'var(--border-glass)', background: 'var(--bg-base)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {label} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>{onCount} of {all.length} on</span>
          </span>
          {all.length > 0 && (
            <span className="text-[13px] flex gap-2" style={{ color: 'var(--accent-primary)' }}>
              <button type="button" className="hover:underline" onClick={() => setAll(list, true)}>All</button>
              <button type="button" className="hover:underline" onClick={() => setAll(list, false)}>None</button>
            </span>
          )}
        </div>
        {list.map(e => (
          <label key={e.key} className="flex items-center gap-2 px-1 py-1 text-sm border-b cursor-pointer hover:bg-white/[0.03]"
            style={{ borderColor: 'var(--border-glass)', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={!off.has(e.key)} onChange={() => toggle(e.key)} />
            <span className="flex-1 truncate" title={e.name}>{e.name}</span>
            <span className="tabular-nums text-[13px]" style={{ color: 'var(--text-muted)' }}>{e.count}</span>
          </label>
        ))}
        {list.length === 0 && (
          <div className="py-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {all.length === 0 ? `No ${label.toLowerCase()} yet.` : 'No match.'}
          </div>
        )}
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div className="glass-panel rounded-lg w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Sources">
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Sources</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none px-1" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <div className="text-[13px] mb-2" style={{ color: 'var(--text-muted)' }}>
            Pick whose videos and articles show up in your feed. New creators are on automatically. Search and the tag popups still show everyone.
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators…"
            className="glass-input text-[color:var(--text-primary)] w-full px-2.5 py-1 text-sm rounded-md" aria-label="Search creators" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0 grid gap-x-6 grid-cols-1 sm:grid-cols-2 items-start">
          {section('Videos', sources.video)}
          {section('Articles', sources.article)}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded" style={{ border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>Cancel</button>
          <button type="button" onClick={save} className="px-3 py-1 text-sm rounded" style={{ background: 'var(--accent-primary)', color: '#fff' }}>Save</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
