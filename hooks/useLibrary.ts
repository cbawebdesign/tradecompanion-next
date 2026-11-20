"use client"

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import { forceCosmosSyncNow } from '@/hooks/useCosmosSync'
import { ensureFeedStart, type LibraryData, type LibraryItem, type LibraryState } from '@/lib/library'

// New items arrive within this long while the Library is open. The worker
// answers 304 while nothing has changed (the browser revalidates its cached
// copy with the ETag), so polling costs next to nothing.
const POLL_MS = 120_000

type Snapshot = { data: LibraryData | null; error: string | null; loading: boolean }

// One copy per window, shared by the page, the tag popup and Customize, and
// kept across tab switches so coming back to the Library is instant.
let snap: Snapshot = { data: null, error: null, loading: false }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null
let lastFetch = 0

function set(next: Partial<Snapshot>) {
  snap = { ...snap, ...next }
  listeners.forEach(l => l())
}

function apiBase(hubUrl: string): string {
  return hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'
}

async function load(hubUrl: string) {
  if (inflight) return inflight
  set({ loading: snap.data == null })
  inflight = (async () => {
    try {
      // 'no-cache' = revalidate with the server every time (ETag → 304), never
      // serve a stale copy without asking.
      const r = await fetch(proxyUrl(`${apiBase(hubUrl)}/Library`), { cache: 'no-cache' })
      const body = await r.json().catch(() => null)
      if (!r.ok || !body?.ok) {
        set({ error: body?.reason || `Library unavailable (HTTP ${r.status})`, loading: false })
        return
      }
      const data: LibraryData = { asOfUtc: body.asOfUtc, items: body.items ?? [], tags: body.tags ?? [] }
      set({ data, error: null, loading: false })
      lastFetch = Date.now()
    } catch {
      set({ error: snap.data ? null : 'Could not reach the Library.', loading: false })
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** The library content (both bases, merged by the worker), polled while mounted. */
export function useLibraryData() {
  const hubUrl = useStore(s => s.config.hubUrl)
  const s = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => snap,
    () => snap,
  )
  useEffect(() => {
    if (!hubUrl) return
    if (Date.now() - lastFetch > 15_000) load(hubUrl)
    const t = setInterval(() => load(hubUrl), POLL_MS)
    return () => clearInterval(t)
  }, [hubUrl])
  return s
}

/**
 * The login's Library state (config.library) and a setter. Every change is
 * pushed to the server straight away rather than on the usual debounce, so a
 * ★ or a Clear all shows up in the other open sessions within a second or two.
 */
export function useLibraryState(): [LibraryState, (fn: (s: LibraryState) => LibraryState) => void] {
  const state = useStore(s => s.config.library) ?? {}
  const update = useCallback((fn: (s: LibraryState) => LibraryState) => {
    const cur = useStore.getState().config.library ?? {}
    const next = fn(cur)
    if (next === cur) return
    useStore.getState().updateConfig({ library: next })
    forceCosmosSyncNow()
  }, [])
  // First open: the feed starts 7 days back.
  useEffect(() => {
    if (!useStore.getState().config.library?.feedStart) update(s => ensureFeedStart(s, Date.now()))
  }, [update])
  return [state, update]
}

export type { LibraryItem }
