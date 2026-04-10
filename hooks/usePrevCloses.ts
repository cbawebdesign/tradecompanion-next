"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'

interface MarketResult {
  Ti: string  // Ticker
  c: number   // Close
  h: number   // High
  l: number   // Low
  o: number   // Open
  v: number   // Volume
}

interface MarketRespObj {
  adjusted: boolean
  queryCount: number
  results: MarketResult[]
}

export function usePrevCloses() {
  const { config, setPrevCloses, updateQuotes, quotes, watchlists } = useStore()
  const fetchedRef = useRef(false)
  const lastFetchRef = useRef<number>(0)

  useEffect(() => {
    if (!config.hubUrl) return

    // Only fetch once per hour
    const now = Date.now()
    if (now - lastFetchRef.current < 60 * 60 * 1000 && fetchedRef.current) {
      return
    }

    async function fetchPrevCloses() {
      try {
        // Build the API URL - remove trailing slashes and /api/ if present
        const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
        const url = `${baseUrl}/api/PrevCloses`

        console.log('Fetching prevCloses from:', url)

        const response = await fetch(proxyUrl(url))
        if (!response.ok) {
          throw new Error(`PrevCloses fetch failed: ${response.status}`)
        }

        const data = await response.json()

        // Handle the MarketRespObj format: { results: [{ Ti, c, ... }, ...] }
        const prevCloses: Record<string, number> = {}

        if (data && Array.isArray(data.results)) {
          // Standard format: { results: [...] }
          data.results.forEach((item: MarketResult) => {
            if (item.Ti && item.c > 0) {
              prevCloses[item.Ti] = item.c
            }
          })
        } else if (Array.isArray(data)) {
          // Direct array format (fallback)
          data.forEach((item: any) => {
            const ticker = item.Ti || item.symbol || item.Symbol
            const close = item.c || item.close || item.Close
            if (ticker && close > 0) {
              prevCloses[ticker] = close
            }
          })
        } else if (typeof data === 'object' && data !== null) {
          // Direct dictionary format (fallback)
          Object.entries(data).forEach(([key, value]) => {
            if (typeof value === 'number' && value > 0) {
              prevCloses[key] = value
            }
          })
        }

        console.log('PrevCloses loaded:', Object.keys(prevCloses).length, 'symbols')
        setPrevCloses(prevCloses)
        fetchedRef.current = true
        lastFetchRef.current = now

        // Seed watchlist quotes with prevClose as last price when no live quote exists
        const currentQuotes = useStore.getState().quotes
        const watchlistSymbols = useStore.getState().watchlists.flatMap(w => w.symbols.map(s => s.symbol))
        const seedQuotes = watchlistSymbols
          .filter(sym => !currentQuotes[sym]?.last && prevCloses[sym])
          .map(sym => ({
            symbol: sym,
            bid: 0,
            ask: 0,
            last: prevCloses[sym],
            volume: 0,
            change: 0,
            changePercent: 0,
            timestamp: new Date(),
          }))
        if (seedQuotes.length > 0) {
          console.log('Seeding', seedQuotes.length, 'watchlist quotes from prevCloses')
          updateQuotes(seedQuotes)
        }

      } catch (error) {
        console.error('Error fetching prevCloses:', error)
      }
    }

    fetchPrevCloses()

    // Refresh every hour
    const interval = setInterval(fetchPrevCloses, 60 * 60 * 1000)
    return () => clearInterval(interval)

  }, [config.hubUrl, setPrevCloses])

  // Re-seed quotes when watchlist changes (e.g. after loading TC key)
  useEffect(() => {
    if (!fetchedRef.current) return // prevCloses not loaded yet
    const prevCloses = useStore.getState().prevCloses
    const currentQuotes = useStore.getState().quotes
    const watchlistSymbols = watchlists.flatMap(w => w.symbols.map(s => s.symbol))
    const seedQuotes = watchlistSymbols
      .filter(sym => !currentQuotes[sym]?.last && prevCloses[sym])
      .map(sym => ({
        symbol: sym,
        bid: 0,
        ask: 0,
        last: prevCloses[sym],
        volume: 0,
        change: 0,
        changePercent: 0,
        timestamp: new Date(),
      }))
    if (seedQuotes.length > 0) {
      console.log('Seeding', seedQuotes.length, 'new watchlist quotes from prevCloses')
      updateQuotes(seedQuotes)
    }
  }, [watchlists, updateQuotes])
}
