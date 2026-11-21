"use client"

import { useState } from 'react'
import { pillColors } from '@/lib/themePerformance'
import type { LibraryItem } from '@/lib/library'

/** Creator avatar with a small YouTube / Substack badge, as in the mockup. */
export function LibraryAvatar({ item, size = 28 }: { item: LibraryItem; size?: number }) {
  const badge = Math.round(size * 0.45)
  // An avatar that fails to load (an expired Airtable link) falls back to the
  // creator's initial instead of a broken-image icon.
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {item.avatar && failed !== item.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.avatar} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(item.avatar)}
          className="rounded-full object-cover" style={{ width: size, height: size, background: 'var(--bg-glass-light)' }} />
      ) : (
        <span className="rounded-full flex items-center justify-center text-[13px] font-semibold"
          style={{ width: size, height: size, background: 'var(--bg-glass-light)', color: 'var(--text-secondary)' }}>
          {(item.name || '?').slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute flex items-center justify-center rounded-[3px]"
        title={item.kind === 'video' ? 'YouTube' : 'Substack'}
        style={{ width: badge, height: badge, right: -2, bottom: -2, background: item.kind === 'video' ? '#ff0000' : '#ff6719', border: '1px solid var(--bg-base)' }}>
        {item.kind === 'video' ? (
          <svg viewBox="0 0 10 10" width={badge * 0.6} height={badge * 0.6} aria-hidden><path d="M3 2l5 3-5 3z" fill="#fff" /></svg>
        ) : (
          <svg viewBox="0 0 10 10" width={badge * 0.6} height={badge * 0.6} aria-hidden><path d="M2 2h6v1.2H2zM2 4h6v1.2H2zM2 6h6v2.4L5 7 2 8.4z" fill="#fff" /></svg>
        )}
      </span>
    </span>
  )
}

/** A tag chip. Same colour for the same tag everywhere (pillColors, as the theme pills). */
export function TagChip({ tag, onClick, title }: { tag: string; onClick?: (tag: string) => void; title?: string }) {
  const c = pillColors(tag)
  const style = { background: c.background, color: c.color, border: `1px solid ${c.border}` }
  if (!onClick) return <span className="px-1.5 rounded-full text-[12px] leading-4 whitespace-nowrap" style={style}>{tag}</span>
  return (
    <button type="button" className="px-1.5 rounded-full text-[12px] leading-4 whitespace-nowrap hover:brightness-125"
      style={style} title={title ?? `Everything tagged ${tag}`}
      onClick={(e) => { e.stopPropagation(); onClick(tag) }}>{tag}</button>
  )
}

export function StarButton({ saved, onClick, size = 'text-lg' }: { saved: boolean; onClick: () => void; size?: string }) {
  return (
    <button type="button" aria-pressed={saved} aria-label={saved ? 'Remove from Saved' : 'Save'}
      title={saved ? 'Saved — click to remove' : 'Save'}
      className={`${size} leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]`}
      style={{ color: saved ? '#facc15' : 'var(--text-muted)' }}
      onClick={(e) => { e.stopPropagation(); onClick() }}>{saved ? '★' : '☆'}</button>
  )
}

export function KindToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-md p-0.5 flex-shrink-0" style={{ background: 'var(--bg-glass-light)', border: '1px solid var(--border-glass)' }}>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className="px-2.5 py-0.5 text-sm rounded"
          style={value === o.value ? { background: 'var(--accent-primary)', color: '#fff' } : { color: 'var(--text-secondary)' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const KIND_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'video' as const, label: 'Videos' },
  { value: 'article' as const, label: 'Articles' },
]

/** Title link. A plain click previews it in TC; Ctrl/⌘/middle-click opens the
 *  source in a new tab, as any link would. A long title wraps to a second
 *  line before it's cut off with "…" (Library updates 11/21, item 3). */
export function TitleLink({ item, onSelect, className = '' }: { item: LibraryItem; onSelect: () => void; className?: string }) {
  return (
    <a href={item.link ?? undefined} target="_blank" rel="noopener noreferrer"
      className={`line-clamp-2 break-words underline underline-offset-2 hover:brightness-125 ${className}`}
      style={{ color: 'var(--library-link, #34d399)' }} title={item.title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) { e.stopPropagation(); return }
        e.preventDefault(); e.stopPropagation(); onSelect()
      }}>{item.title}</a>
  )
}

/**
 * A drag handle between two panes. Drag to resize; double-click to put the
 * default back. Pointer capture keeps the drag going over the YouTube player.
 */
export function Splitter({ dir, onDrag, onReset, label }: {
  dir: 'row' | 'col'                 // 'row' = horizontal bar between top and bottom
  onDrag: (clientPos: number) => void
  onReset: () => void
  label: string
}) {
  const [active, setActive] = useState(false)
  const horizontal = dir === 'row'
  return (
    <div role="separator" aria-orientation={horizontal ? 'horizontal' : 'vertical'} aria-label={label}
      title="Drag to resize · double-click to reset"
      className="group relative flex-shrink-0 flex items-center justify-center select-none touch-none"
      style={horizontal ? { height: 7, cursor: 'row-resize' } : { width: 7, cursor: 'col-resize' }}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setActive(true) }}
      onPointerMove={(e) => { if (active) onDrag(horizontal ? e.clientY : e.clientX) }}
      onPointerUp={(e) => { setActive(false); e.currentTarget.releasePointerCapture(e.pointerId) }}
      onPointerCancel={() => setActive(false)}
      onDoubleClick={onReset}>
      <span className={`absolute transition-colors ${active ? '' : 'group-hover:!bg-[var(--accent-primary)]'}`}
        style={{
          ...(horizontal ? { left: 0, right: 0, height: active ? 2 : 1 } : { top: 0, bottom: 0, width: active ? 2 : 1 }),
          background: active ? 'var(--accent-primary)' : 'var(--border-glass)',
        }} />
      <span className="relative rounded-full opacity-60 group-hover:opacity-100"
        style={{ ...(horizontal ? { width: 28, height: 3 } : { width: 3, height: 28 }), background: 'var(--text-muted)' }} />
    </div>
  )
}
