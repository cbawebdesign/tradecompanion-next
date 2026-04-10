"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
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
// Module-level cursors survive React remounts (but not full page reload)
let persistedLastFilingTime: string | null = null
let persistedSeenFilingIds: Set<string> = new Set()

export function useFilingsPolling() {
  const { config, addAlert, addAlerts, watchlists } = useStore()
  const lastFilingTimeRef = useRef<string | null>(persistedLastFilingTime)
  const seenFilingIdsRef = useRef<Set<string>>(persistedSeenFilingIds)
  // Use ref so watchlist changes don't restart the polling effect
  const watchlistsRef = useRef(watchlists)
  watchlistsRef.current = watchlists

  useEffect(() => {
    if (!config.hubUrl) return

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

      // Read latest watchlists from ref (not stale closure)
      const watchlistSymbols = new Set(
        watchlistsRef.current.flatMap(w => w.symbols.map(s => s.symbol.toUpperCase()))
      )

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

        const response = await fetch(proxyUrl(url))
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

        // Build batch of new alerts
        const batch: Alert[] = []
        for (const filing of sortedFilings) {
          const filingId = filing.dcn
            ? `${filing.cik}-${filing.dcn}`
            : `${filing.symbol}-${filing.form}-${filing.time_et || filing.date}`

          if (seenFilingIdsRef.current.has(filingId)) continue
          seenFilingIdsRef.current.add(filingId)

          // ExcludeFilings: skip certain form types (pipe-separated)
          const excludeStr = config.excludeFilings || ''
          if (excludeStr && filing.form) {
            const excludeList = excludeStr.split('|').map(s => s.trim().toLowerCase())
            if (excludeList.includes(filing.form.toLowerCase())) continue
          }

          const filingSymbols = filing.symbol.split(',').map(s => s.trim().toUpperCase())
          const matchedSymbol = filingSymbols.find(s => watchlistSymbols.has(s)) || filing.symbol

          batch.push({
            id: crypto.randomUUID(),
            symbol: matchedSymbol,
            message: `${filing.form}${filing.title ? ': ' + filing.title : ''}`,
            type: 'filing',
            color: '#00bcd4',
            timestamp: new Date(filing.time_et || filing.date || new Date()),
            read: false,
            url: filing.url,
          })
        }

        // Single store update for initial load, one-by-one for live updates
        if (batch.length > 0) {
          if (isInitialFetch) addAlerts(batch)
          else batch.forEach(a => addAlert(a))
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
          persistedLastFilingTime = lastFilingTimeRef.current
        }

        // Keep seen filings set from growing too large
        if (seenFilingIdsRef.current.size > 500) {
          const arr = Array.from(seenFilingIdsRef.current)
          seenFilingIdsRef.current = new Set(arr.slice(-250))
        }
        persistedSeenFilingIds = seenFilingIdsRef.current

      } catch (err) {
        console.error('Error fetching filings:', err)
      }
    }

    // Stagger initial fetch to avoid ERR_INSUFFICIENT_RESOURCES
    const initTimer = setTimeout(fetchFilings, 2000)

    // Poll every 60 seconds (filings don't come as frequently as tweets)
    const interval = setInterval(() => {
      if (!cancelled) {
        fetchFilings()
      }
    }, 60000)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      clearInterval(interval)
      // Reset for hot reload / remount
      hasInitiallyFetched = false
    }
  }, [config.hubUrl, addAlert, addAlerts])
}
