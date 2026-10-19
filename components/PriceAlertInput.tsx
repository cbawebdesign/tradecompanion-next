"use client"

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

interface PriceAlertInputProps {
  value: number | null
  onCommit: (val: number | null) => void
  /** Adds a flash highlight (used when a price alert just triggered) */
  triggered?: boolean
  className?: string
  onClick?: (e: React.MouseEvent) => void
}

/**
 * Inline price input for upper/lower alert cells.
 *
 *  - Uses `type="text"` + `inputMode="decimal"` so we get the numeric mobile
 *    keyboard but no native up/down spin arrows that overlap the typed value.
 *  - Display format: 4 decimals when value < $1, 2 decimals otherwise.
 *    Matches Justin's "show full prices" ask for sub-dollar stocks.
 *  - Internal edit state while focused, so the formatter doesn't fight typing.
 *    On blur or Enter we parse + commit; Escape reverts.
 */
export function PriceAlertInput({
  value,
  onCommit,
  triggered,
  className,
  onClick,
}: PriceAlertInputProps) {
  const formatted = formatPrice(value)
  const [draft, setDraft] = useState(formatted)
  const [editing, setEditing] = useState(false)
  const lastFormattedRef = useRef(formatted)

  // Sync draft from the store when the value changes externally and we're not
  // editing — covers price-alert auto-clear (5 sec after trigger), Cosmos pull,
  // etc. Without this guard a typing user would have their input clobbered by
  // every external store update.
  useEffect(() => {
    if (!editing && formatted !== lastFormattedRef.current) {
      setDraft(formatted)
      lastFormattedRef.current = formatted
    }
  }, [formatted, editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onCommit(null)
      lastFormattedRef.current = ''
      return
    }
    const n = parseFloat(trimmed)
    if (!isNaN(n) && n > 0) {
      onCommit(n)
      const reformatted = formatPrice(n)
      setDraft(reformatted)
      lastFormattedRef.current = reformatted
    } else {
      // Invalid input — revert to last good value
      setDraft(formatted)
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => { setEditing(false); commit() }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
        else if (e.key === 'Escape') { setDraft(formatted); (e.target as HTMLInputElement).blur() }
      }}
      onClick={onClick}
      placeholder="-"
      className={clsx(
        // price-alert-input carries the real sizing — see globals.css. The
        // Tailwind sizing utilities that used to live here lost to the generic
        // input[type="text"] rule and never applied.
        'w-16 text-right transition-colors price-alert-input',
        triggered && 'price-alert-flash',
        className,
      )}
    />
  )
}

function formatPrice(val: number | null): string {
  if (val == null || val === 0) return ''
  return val < 1 ? val.toFixed(4) : val.toFixed(2)
}
