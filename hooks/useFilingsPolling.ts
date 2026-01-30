"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import type { Alert } from '@/types'

// Filing from Azure API (matches lx_filing_rss)
interface Filing {
  id?: string
  symbol: string
  form: string        // e.g., "10-Q", "8-K"
  title?: string
  url?: string
  date?: string       // filing date
  time_et?: string    // filing time ET
  save_time?: string
  cik?: number
  dcn?: string
}

// Module-level flag to prevent React Strict Mode double-fetch
let hasInitiallyFetched = false

export function useFilingsPolling() {
  const { config, addAlert, watchlists } = useStore()
  const lastFilingTimeRef = useRef<string | null>(null)
  const seenFilingIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!config.hubUrl) return

    // Get all symbols from watchlists for filtering (computed inside effect)
    const watchlistSymbols = new Set(
      watchlists.flatMap(w => w.symbols.map(s => s.symbol.toUpperCase()))
    )

    // Get base URL from hubUrl
    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const filingsUrl = `${baseUrl}/api/Filings`

    let cancelled = false

    async function fetchFilings() {
      // Prevent React Strict Mode from fetching twice on initial load
      const isInitialFetch = !hasInitiallyFetched
      if (isInitialFetch) {
        hasInitiallyFetched = true
      }

      try {
        // Build URL - only add since param for subsequent fetches
        // Initial fetch uses API default (last 5 days), we limit client-side
        let url = filingsUrl
        if (lastFilingTimeRef.current) {
          // Format: MM/DD/YYYY HH:MM:SS (what .NET DateTime.TryParse expects)
          const d = new Date(lastFilingTimeRef.current)
          const formatted = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
          url += `?since=${encodeURIComponent(formatted)}`
        }

        const response = await fetch(url)
        if (!response.ok) {
          console.log('Filings fetch failed:', response.status)
          return
        }

        const filings: Filing[] = await response.json()

        if (filings.length === 0) return

        // Filter to only filings for symbols in watchlist (like legacy app does)
        // But also include filings without symbols (some alert types don't have them)
        const watchlistFilings = filings.filter(f => {
          // If no symbol, include it (could be a general alert)
          if (!f.symbol || f.symbol.trim() === '') return true
          // Symbol can be comma-separated (e.g., "AAPL,GOOG")
          const symbols = f.symbol.split(',').map(s => s.trim().toUpperCase())
          return symbols.some(s => watchlistSymbols.has(s))
        })

        console.log('Fetched', filings.length, 'filings,', watchlistFilings.length, 'match watchlist', isInitialFetch ? '(initial)' : '(poll)')

        if (watchlistFilings.length === 0) return

        // Process new filings (oldest first by time_et or date)
        const sortedFilings = [...watchlistFilings].sort((a, b) => {
          const timeA = new Date(a.time_et || a.date || 0).getTime()
          const timeB = new Date(b.time_et || b.date || 0).getTime()
          return timeA - timeB
        })

        for (const filing of sortedFilings) {
          // Create unique ID from cik + dcn (or fallback to symbol + form + time)
          const filingId = filing.dcn
            ? `${filing.cik}-${filing.dcn}`
            : `${filing.symbol}-${filing.form}-${filing.time_et || filing.date}`

          // Skip if we've already seen this filing
          if (seenFilingIdsRef.current.has(filingId)) continue
          seenFilingIdsRef.current.add(filingId)

          // Get first matching watchlist symbol
          const filingSymbols = filing.symbol.split(',').map(s => s.trim().toUpperCase())
          const matchedSymbol = filingSymbols.find(s => watchlistSymbols.has(s)) || filing.symbol

          // Create alert from filing
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: matchedSymbol,
            message: `${filing.form}${filing.title ? ': ' + filing.title : ''}`,
            type: 'filing',
            color: '#00bcd4', // Cyan for filings
            timestamp: new Date(filing.time_et || filing.date || new Date()),
            read: false,
            url: filing.url,
          }

          addAlert(alert)
        }

        // Update last filing time for next fetch (use original filings, not filtered)
        // This ensures we track all filings we've seen, not just watchlist ones
        const allSorted = [...filings].sort((a, b) => {
          const timeA = new Date(a.time_et || a.date || 0).getTime()
          const timeB = new Date(b.time_et || b.date || 0).getTime()
          return timeA - timeB
        })
        if (allSorted.length > 0) {
          const lastFiling = allSorted[allSorted.length - 1]
          lastFilingTimeRef.current = lastFiling.time_et || lastFiling.date || null
        }

        // Keep seen filings set from growing too large
        if (seenFilingIdsRef.current.size > 500) {
          const arr = Array.from(seenFilingIdsRef.current)
          seenFilingIdsRef.current = new Set(arr.slice(-250))
        }

      } catch (err) {
        console.error('Error fetching filings:', err)
      }
    }

    // Initial fetch
    fetchFilings()

    // Poll every 60 seconds (filings don't come as frequently as tweets)
    const interval = setInterval(() => {
      if (!cancelled) {
        fetchFilings()
      }
    }, 60000)

    return () => {
      cancelled = true
      clearInterval(interval)
      // Reset for hot reload / remount
      hasInitiallyFetched = false
    }
  }, [config.hubUrl, addAlert, watchlists])
}
