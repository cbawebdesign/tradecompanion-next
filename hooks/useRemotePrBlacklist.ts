"use client"

import { useEffect } from 'react'
import { setRemotePrBlacklist } from '@/lib/excludePrPatterns'

// Prefer the SAME-ORIGIN proxy (Next.js rewrite /tc3 -> tradecompanion3) so the
// fetch is never subject to cross-origin (CORS) blocking. The direct Azure URL
// is only CORS-allowed for a specific origin allowlist, so on any other origin
// the remote admin list silently failed to load and clients fell back to the
// hardcoded default — i.e. "the admin dashboard blacklist doesn't filter".
// Absolute URL kept as a fallback for environments without the proxy (e.g. a
// packaged desktop build serving static files with no Next server).
const ADMIN_ENDPOINTS = [
  '/tc3/api/tcadmin/pr-blacklist',
  'https://tradecompanion3.azurewebsites.net/api/tcadmin/pr-blacklist',
]
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
      // Try the same-origin proxy first, then the absolute URL. First success wins.
      for (const url of ADMIN_ENDPOINTS) {
        try {
          const resp = await fetch(url, { cache: 'no-store' })
          if (!resp.ok) continue
          const data = await resp.json()
          if (cancelled) return
          setRemotePrBlacklist(typeof data.patterns === 'string' ? data.patterns : null)
          return
        } catch {
          // Try the next endpoint. If all fail, leave remote as-is (previous
          // value on a reconnect, or null on first attempt) — the local
          // fallback chain (per-Settings value, then hardcoded default) applies.
        }
      }
    }

    void fetchOnce()
    const interval = setInterval(fetchOnce, REFRESH_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])
}
