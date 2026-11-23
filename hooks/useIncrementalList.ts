"use client"

import { useEffect, useRef, useState } from 'react'
import { LIST_PAGE } from '@/lib/library'

/**
 * Draws a long list a page at a time: the first `page` rows, then another
 * page whenever the sentinel (put it after the last row) scrolls near view.
 * With the Library at ~36k records, drawing every search result at once
 * froze TC for seconds on the first keystroke (11/23).
 *
 * A new list starts again at one page, decided during render so the first
 * render of a new list is never the big one.
 */
export function useIncrementalList<T>(list: T[], page: number = LIST_PAGE) {
  const [state, setState] = useState({ list, count: page })
  let count = state.count
  if (state.list !== list) {
    count = page
    setState({ list, count })
  }
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el || count >= list.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => { if (entries.some(e => e.isIntersecting)) setState(s => ({ ...s, count: s.count + page })) },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [count, list.length, page])

  return { visible: count >= list.length ? list : list.slice(0, count), sentinel, remaining: Math.max(0, list.length - count) }
}
