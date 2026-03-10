"use client"

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { preloadStockData } from '@/components/StockDataRibbon'

/**
 * Background-preloads StockData for all watchlist symbols into the shared cache.
 * Runs once 5 seconds after mount to avoid competing with initial page load.
 */
export function useStockDataPreload() {
  const watchlists = useStore((s) => s.watchlists)
  const hubUrl = useStore((s) => s.config.hubUrl)

  useEffect(() => {
    if (!hubUrl || watchlists.length === 0) return

    const timer = setTimeout(() => {
      const allSymbols = Array.from(
        new Set(watchlists.flatMap(wl => wl.symbols.map(s => s.symbol)))
      )
      if (allSymbols.length > 0) {
        preloadStockData(allSymbols, hubUrl)
      }
    }, 5000)

    return () => clearTimeout(timer)
  }, []) // Only once on mount — watchlists come from persisted store
}
