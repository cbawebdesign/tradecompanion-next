"use client"

import { useEffect } from 'react'
import { setRemoteSymbolBlocklist } from '@/lib/symbolBlocklist'

// Same-origin proxy first, absolute URL as fallback — identical reasoning to
// useRemotePrBlacklist: the direct Azure URL is only CORS-allowed for a specific
// origin allowlist, so on any other origin the fetch fails silently and the user
// would be left wondering why the list never loaded.
const ADMIN_ENDPOINTS = [
  '/tc3/api/tcadmin/symbol-blocklist',
  'https://tradecompanion3.azurewebsites.net/api/tcadmin/symbol-blocklist',
]
const REFRESH_MS = 5 * 60 * 1000 // admin edits propagate within one window

/**
 * Pulls the admin-curated symbol blocklist into the module cache that
 * lib/symbolBlocklist.ts reads from. The store's alert gate consults it on every
 * incoming alert.
 *
 * Fails silently and fails OPEN — if every endpoint is unreachable the cache
 * keeps whatever it had (or stays empty on a cold start) and nothing is hidden.
 * Hiding alerts because a fetch failed would be the worst possible failure mode
 * here.
 */
export function useRemoteSymbolBlocklist() {
  useEffect(() => {
    let cancelled = false

    async function fetchOnce() {
      for (const url of ADMIN_ENDPOINTS) {
        try {
          const resp = await fetch(url, { cache: 'no-store' })
          if (!resp.ok) continue
          const data = await resp.json()
          if (cancelled) return
          setRemoteSymbolBlocklist(
            typeof data.symbols === 'string' ? data.symbols : null,
            typeof data.label === 'string' ? data.label : null
          )
          return
        } catch {
          // Try the next endpoint; if all fail, leave the cache as-is.
        }
      }
    }

    void fetchOnce()
    const interval = setInterval(fetchOnce, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])
}
