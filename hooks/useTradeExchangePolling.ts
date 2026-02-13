"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
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
  const { config, addAlert, watchlists } = useStore()
  const lastTimeRef = useRef<string | null>(null)
  const seenIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!config.hubUrl) return

    const watchlistSymbols = new Set(
      watchlists.flatMap(w => w.symbols.map(s => s.symbol.toUpperCase()))
    )

    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const apiUrl = `${baseUrl}/api/TradeExchangeGet`

    let cancelled = false

    async function fetchPosts() {
      const isInitialFetch = !hasInitiallyFetched
      if (isInitialFetch) {
        hasInitiallyFetched = true
      }

      try {
        let url = apiUrl
        if (lastTimeRef.current) {
          const d = new Date(lastTimeRef.current)
          const formatted = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
          url += `?since=${encodeURIComponent(formatted)}`
        }

        const response = await fetch(url)
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

        let newCount = 0
        for (const post of sorted) {
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
            symbol: alertSymbol.toUpperCase(),
            message: `[${post.source}] ${post.content}`,
            type: 'trade_exchange',
            color: '#eab308',
            timestamp: new Date(post.save_time_utc),
            read: false,
          }

          addAlert(alert)
          newCount++
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

    fetchPosts()

    // Poll every 30 seconds (TX posts come more frequently than filings)
    const interval = setInterval(() => {
      if (!cancelled) fetchPosts()
    }, 30000)

    return () => {
      cancelled = true
      clearInterval(interval)
      hasInitiallyFetched = false
    }
  }, [config.hubUrl, addAlert, watchlists])
}
