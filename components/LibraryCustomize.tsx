"use client"

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_TOOLBAR_TAGS, visibleToolbar, type LibraryState, type TagCount } from '@/lib/library'

/**
 * Customize toolbar tags (spec section 7). Up to 8 tags, drag to reorder, ×
 * to remove; every in-use tag with its count across both bases. Save and
 * Reset to default go to the login's settings, which sync live to every open
 * session.
 */
export function LibraryCustomize({ tags, lib, onSave, onReset, onClose }: {
  tags: TagCount[]
  lib: LibraryState
  onSave: (toolbarTags: string[]) => void
  onReset: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<string[]>(() => visibleToolbar(lib, tags))
  const [q, setQ] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const full = draft.length >= MAX_TOOLBAR_TAGS

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? tags.filter(t => t.tag.toLowerCase().includes(s)) : tags
  }, [tags, q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (tag: string) => setDraft(d => d.includes(tag) ? d.filter(x => x !== tag) : d.length >= MAX_TOOLBAR_TAGS ? d : [...d, tag])
  const move = (from: number, to: number) => setDraft(d => {
    if (from === to) return d
    const next = [...d]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    return next
  })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div className="glass-panel rounded-lg w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Customize toolbar tags">
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Customize toolbar tags</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none px-1" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="px-4 pt-3 flex-shrink-0">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tags…" className="glass-input text-[color:var(--text-primary)] w-full px-2.5 py-1 text-xs rounded-md" aria-label="Search tags" />
          <div className="mt-3 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>On your toolbar</div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Up to {MAX_TOOLBAR_TAGS} tags. Drag to reorder.</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5 min-h-[28px]">
            {draft.map((t, i) => (
              <span key={t} draggable
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => { e.preventDefault(); if (dragIdx != null && dragIdx !== i) { move(dragIdx, i); setDragIdx(i) } }}
                onDragEnd={() => setDragIdx(null)}
                className="flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full text-[11px] cursor-grab select-none"
                style={{ background: 'var(--bg-glass-light)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', opacity: dragIdx === i ? 0.5 : 1 }}>
                <span style={{ color: 'var(--text-muted)' }} aria-hidden>⠿</span>
                {t}
                <button type="button" onClick={() => toggle(t)} aria-label={`Remove ${t}`} className="px-0.5 hover:brightness-150" style={{ color: 'var(--text-muted)' }}>×</button>
              </span>
            ))}
            {draft.length === 0 && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No tags — the toolbar shows just Customize.</span>}
          </div>
          <div className="mt-3 mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>All tags</div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 min-h-0">
          {shown.map(t => {
            const on = draft.includes(t.tag)
            const disabled = !on && full
            return (
              <label key={t.tag} className={`flex items-center gap-2 px-2 py-1 text-xs border-b ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-white/[0.03]'}`}
                style={{ borderColor: 'var(--border-glass)', color: 'var(--text-primary)' }}
                title={disabled ? `The toolbar holds up to ${MAX_TOOLBAR_TAGS} tags` : undefined}>
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(t.tag)} />
                <span className="flex-1">{t.tag}</span>
                <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{t.count}</span>
              </label>
            )
          })}
          {shown.length === 0 && <div className="p-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>No tags match.</div>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border-glass)' }}>
          <button type="button" onClick={onReset} className="text-xs hover:underline" style={{ color: 'var(--text-secondary)' }}>Reset to default</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1 text-xs rounded" style={{ border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>Cancel</button>
            <button type="button" onClick={() => onSave(draft)} className="px-3 py-1 text-xs rounded" style={{ background: 'var(--accent-primary)', color: '#fff' }}>Save</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
