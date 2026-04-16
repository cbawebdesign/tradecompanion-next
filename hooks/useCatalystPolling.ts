"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import type { Alert } from '@/types'

interface CatalystItem {
  symbol: string
  saveTime_et: string   // DateTime as ISO string
  startPrice: number
  title: string
}

let hasInitiallyFetched = false
// Module-level cursor survives React remounts (but not full page reload)
let persistedLastTime: string | null = null
let persistedSeenKeys: Set<string> = new Set()

export function useCatalystPolling() {
  const { config, addAlert, watchlists } = useStore()
  const lastTimeRef = useRef<string | null>(persistedLastTime)
  const seenKeysRef = useRef<Set<string>>(persistedSeenKeys)
  // Use ref so watchlist changes don't restart the polling effect
  const watchlistsRef = useRef(watchlists)
  watchlistsRef.current = watchlists

  useEffect(() => {
    if (!config.hubUrl) return

    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const apiUrl = `${baseUrl}/api/Catalyst`

    let cancelled = false

    async function fetchCatalysts() {
      const isInitialFetch = !hasInitiallyFetched
      if (isInitialFetch) {
        hasInitiallyFetched = true
      }

      // Read latest watchlists from ref (not stale closure)
      const watchlistSymbols = new Set(
        watchlistsRef.current.flatMap(w => w.symbols.map(s => s.symbol.toUpperCase()))
      )

      try {
        let url = apiUrl
        if (lastTimeRef.current) {
          const d = new Date(lastTimeRef.current)
          const formatted = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
          url += `?since=${encodeURIComponent(formatted)}`
        }

        const response = await fetch(proxyUrl(url))
        if (!response.ok) {
          // 503 = catalyst service not ready, don't log as error
          if (response.status !== 503) {
            console.log('Catalyst fetch failed:', response.status)
          }
          return
        }

        const items: CatalystItem[] = await response.json()
        if (items.length === 0) return

        // Sort oldest first
        const sorted = [...items].sort((a, b) =>
          new Date(a.saveTime_et).getTime() - new Date(b.saveTime_et).getTime()
        )

        let newCount = 0
        for (const item of sorted) {
          const key = `${item.symbol}-${item.saveTime_et}`
          if (seenKeysRef.current.has(key)) continue
          seenKeysRef.current.add(key)

          // Only show for watchlist symbols (catalyst PRs are high volume)
          if (watchlistSymbols.size > 0 && !watchlistSymbols.has(item.symbol.toUpperCase())) continue

          const alert: Alert = {
            id: crypto.randomUUID(),
            dedupKey: `cat:${item.symbol}-${item.saveTime_et}`,
            source: 'useCatalystPolling',
            symbol: item.symbol.toUpperCase(),
            message: `${item.title}${item.startPrice ? ` ($${item.startPrice.toFixed(2)})` : ''}`,
            type: 'catalyst',
            color: '#f97316',
            timestamp: new Date(item.saveTime_et),
            read: false,
          }

          addAlert(alert)
          newCount++
        }

        if (newCount > 0) {
          console.log('Catalyst:', newCount, 'new PRs', isInitialFetch ? '(initial)' : '(poll)')
        }

        // Update cursor (also persist to module level so remounts don't reset)
        if (sorted.length > 0) {
          lastTimeRef.current = sorted[sorted.length - 1].saveTime_et
          persistedLastTime = lastTimeRef.current
        }

        // Trim seen set
        if (seenKeysRef.current.size > 500) {
          const arr = Array.from(seenKeysRef.current)
          seenKeysRef.current = new Set(arr.slice(-250))
        }
        persistedSeenKeys = seenKeysRef.current
      } catch (err) {
        console.error('Error fetching catalysts:', err)
      }
    }

    // Stagger initial fetch to avoid ERR_INSUFFICIENT_RESOURCES
    const initTimer = setTimeout(fetchCatalysts, 5000)

    // Poll every 60 seconds
    const interval = setInterval(() => {
      if (!cancelled) fetchCatalysts()
    }, 60000)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      clearInterval(interval)
      hasInitiallyFetched = false
    }
  }, [config.hubUrl, addAlert])
}
