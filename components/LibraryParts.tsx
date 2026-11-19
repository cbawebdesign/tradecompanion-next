"use client"

import { pillColors } from '@/lib/themePerformance'
import type { LibraryItem } from '@/lib/library'

/** Creator avatar with a small YouTube / Substack badge, as in the mockup. */
export function LibraryAvatar({ item, size = 28 }: { item: LibraryItem; size?: number }) {
  const badge = Math.round(size * 0.45)
  return (
    <span className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {item.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.avatar} alt="" width={size} height={size} loading="lazy"
          className="rounded-full object-cover" style={{ width: size, height: size, background: 'var(--bg-glass-light)' }} />
      ) : (
        <span className="rounded-full flex items-center justify-center text-[11px] font-semibold"
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
  if (!onClick) return <span className="px-1.5 rounded-full text-[10px] leading-4 whitespace-nowrap" style={style}>{tag}</span>
  return (
    <button type="button" className="px-1.5 rounded-full text-[10px] leading-4 whitespace-nowrap hover:brightness-125"
      style={style} title={title ?? `Everything tagged ${tag}`}
      onClick={(e) => { e.stopPropagation(); onClick(tag) }}>{tag}</button>
  )
}

export function StarButton({ saved, onClick, size = 'text-base' }: { saved: boolean; onClick: () => void; size?: string }) {
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
          className="px-2.5 py-0.5 text-xs rounded"
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
 *  source in a new tab, as any link would. */
export function TitleLink({ item, onSelect, className = '' }: { item: LibraryItem; onSelect: () => void; className?: string }) {
  return (
    <a href={item.link ?? undefined} target="_blank" rel="noopener noreferrer"
      className={`block truncate underline underline-offset-2 hover:brightness-125 ${className}`}
      style={{ color: 'var(--library-link, #34d399)' }} title={item.title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) { e.stopPropagation(); return }
        e.preventDefault(); e.stopPropagation(); onSelect()
      }}>{item.title}</a>
  )
}
