"use client"

import { useEffect } from 'react'
import { setRemotePrBlacklist } from '@/lib/excludePrPatterns'

const ADMIN_ENDPOINT = 'https://tradecompanion3.azurewebsites.net/api/tcadmin/pr-blacklist'
const REFRESH_MS = 5 * 60 * 1000  // pull every 5 min so admin edits propagate within one window

// Fetches the centralized PR blacklist from the admin dashboard endpoint and
// stashes it in the excludePrPatterns module cache. All PR-receive paths
// (useSignalR, useNewsHub) pick it up on the next buildExcludePrRegex() call.
//
// Fails silently — if the endpoint is unreachable, clients fall back to their
// per-Settings value or the hardcoded default. Never user-visible.
export function useRemotePrBlacklist() {
  useEffect(() => {
    let cancelled = false

    async function fetchOnce() {
      try {
        const resp = await fetch(ADMIN_ENDPOINT, { cache: 'no-store' })
        if (!resp.ok) return
        const data = await resp.json()
        if (cancelled) return
        setRemotePrBlacklist(typeof data.patterns === 'string' ? data.patterns : null)
      } catch {
        // Network error — leave remote as-is (could be a previous fetch's value
        // on a reconnect, or null if this is the first attempt). Local fallback
        // chain takes over.
      }
    }

    void fetchOnce()
    const interval = setInterval(fetchOnce, REFRESH_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])
}
