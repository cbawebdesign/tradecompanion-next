"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import type { Alert } from '@/types'

interface TradeExchangePost {
  id: string
  save_time_utc: string
  source: string        // e.g. "TX-Team", "TX-News", "TX-News1"
  content: string
  symbols: string[]
}

// Parse $CASHTAG symbols from content text
function parseCashtags(text: string): string[] {
  const matches = text.match(/\$([A-Z]{1,5})/g)
  if (!matches) return []
  return Array.from(new Set(matches.map(m => m.slice(1))))
}

// Parse leading ticker: "CRDO Credo's Toucan PCIe..." → "CRDO"
function parseLeadingTicker(text: string): string | null {
  const match = text.match(/^([A-Z]{1,5})\b[\s\-]/)
  return match ? match[1] : null
}

let hasInitiallyFetched = false

export function useTradeExchangePolling() {
  const { config, addAlert, addAlerts, watchlists } = useStore()
  const lastTimeRef = useRef<string | null>(null)
  const seenIdsRef = useRef<Set<string>>(new Set())
  // Use ref so watchlist changes don't restart the polling effect
  const watchlistsRef = useRef(watchlists)
  watchlistsRef.current = watchlists

  useEffect(() => {
    if (!config.hubUrl) return

    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const apiUrl = `${baseUrl}/api/TradeExchangeGet`

    let cancelled = false

    async function fetchPosts() {
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
        const params: string[] = []
        if (lastTimeRef.current) {
          const d = new Date(lastTimeRef.current)
          const formatted = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
          params.push(`since=${encodeURIComponent(formatted)}`)
        }
        // Phase 2: server-side subscription filter (opt-in via userKey).
        if (config.userKey) params.push(`userKey=${encodeURIComponent(config.userKey)}`)
        if (params.length > 0) url += '?' + params.join('&')

        const response = await fetch(proxyUrl(url))
        if (!response.ok) {
          console.log('TradeExchange fetch failed:', response.status)
          return
        }

        const posts: TradeExchangePost[] = await response.json()
        if (posts.length === 0) return

        // Sort oldest first
        const sorted = [...posts].sort((a, b) =>
          new Date(a.save_time_utc).getTime() - new Date(b.save_time_utc).getTime()
        )

        // On initial load, only show the most recent 20 (not 700+)
        const toProcess = isInitialFetch ? sorted.slice(-20) : sorted

        // Still mark ALL as seen so they don't re-appear on subsequent polls
        if (isInitialFetch) {
          for (const post of sorted) seenIdsRef.current.add(post.id)
        }

        const batch: Alert[] = []
        let newCount = 0
        for (const post of toProcess) {
          if (seenIdsRef.current.has(post.id)) continue
          seenIdsRef.current.add(post.id)

          // Determine symbols: use server-side symbols array, fallback to parsing
          let symbols = post.symbols?.length > 0
            ? post.symbols
            : parseCashtags(post.content)

          // Fallback: try leading ticker
          if (symbols.length === 0) {
            const leading = parseLeadingTicker(post.content)
            if (leading) symbols = [leading]
          }

          // Filter: only create alert if a symbol matches watchlist, or no symbols (general post)
          const matchedSymbol = symbols.find(s => watchlistSymbols.has(s.toUpperCase()))

          // Show all TX posts (they're already curated content)
          const alertSymbol = matchedSymbol || symbols[0] || ''

          const alert: Alert = {
            id: crypto.randomUUID(),
            dedupKey: `tx:${post.id}`,
            source: 'useTradeExchangePolling',
            symbol: alertSymbol.toUpperCase(),
            message: `[${post.source}] ${post.content}`,
            type: 'trade_exchange',
            color: '#eab308',
            timestamp: new Date(post.save_time_utc),
            read: false,
          }

          batch.push(alert)
          newCount++
        }

        if (batch.length > 0) {
          if (isInitialFetch) addAlerts(batch)
          else batch.forEach(a => addAlert(a))
        }
        if (newCount > 0) {
          console.log('TradeExchange:', newCount, 'new posts', isInitialFetch ? '(initial)' : '(poll)')
        }

        // Update cursor
        if (sorted.length > 0) {
          lastTimeRef.current = sorted[sorted.length - 1].save_time_utc
        }

        // Trim seen set
        if (seenIdsRef.current.size > 500) {
          const arr = Array.from(seenIdsRef.current)
          seenIdsRef.current = new Set(arr.slice(-250))
        }
      } catch (err) {
        console.error('Error fetching trade exchange:', err)
      }
    }

    // Stagger initial fetch to avoid ERR_INSUFFICIENT_RESOURCES
    const initTimer = setTimeout(fetchPosts, 3500)

    // Poll every 30 seconds (TX posts come more frequently than filings)
    const interval = setInterval(() => {
      if (!cancelled) fetchPosts()
    }, 30000)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      clearInterval(interval)
      hasInitiallyFetched = false
    }
  }, [config.hubUrl, addAlert])
}
