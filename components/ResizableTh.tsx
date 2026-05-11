"use client"

import { useRef, useState, useEffect } from 'react'

interface ResizableThProps {
  /** Stable key under which the width is stored in config */
  columnKey: string
  /** Map of all column widths for this table */
  widths: Record<string, number> | undefined
  /** Persist a single column's width back to config */
  setWidth: (key: string, px: number) => void
  /** Width used until the user resizes */
  defaultWidth: number
  /** Minimum width allowed, defaults to 40px */
  minWidth?: number
  /** Forwarded `<th>` props */
  className?: string
  style?: React.CSSProperties
  title?: string
  onClick?: () => void
  children: React.ReactNode
}

/**
 * A `<th>` with a draggable resize handle on its right edge.
 * Width is read from the supplied map and committed back via `setWidth`
 * on mouseup so we only update the store once per resize gesture (avoids
 * persisting 60 times/sec during a drag).
 */
export function ResizableTh({
  columnKey,
  widths,
  setWidth,
  defaultWidth,
  minWidth = 40,
  className,
  style,
  title,
  onClick,
  children,
}: ResizableThProps) {
  const stored = widths?.[columnKey]
  const persistedWidth = typeof stored === 'number' && stored >= minWidth ? stored : defaultWidth

  // Live width during drag (avoids re-rendering parent on every mousemove).
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    if (!dragRef.current) return
    const handleMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const delta = e.clientX - d.startX
      setDragWidth(Math.max(minWidth, d.startW + delta))
    }
    const handleUp = () => {
      const final = dragWidth
      dragRef.current = null
      setDragWidth(null)
      if (final != null) setWidth(columnKey, Math.round(final))
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragWidth, columnKey, minWidth, setWidth])

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startW: persistedWidth }
    setDragWidth(persistedWidth) // triggers effect to attach window listeners
  }

  const w = dragWidth ?? persistedWidth

  return (
    <th
      className={className}
      style={{ ...style, width: w, minWidth: w, position: 'relative' }}
      title={title}
      onClick={onClick}
    >
      {children}
      <span
        onMouseDown={startResize}
        onClick={(e) => e.stopPropagation()}
        title="Drag to resize column"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 5,
          cursor: 'col-resize',
          userSelect: 'none',
        }}
      />
    </th>
  )
}
