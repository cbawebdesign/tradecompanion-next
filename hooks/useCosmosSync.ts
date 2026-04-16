"use client"

// Cosmos DB Watchlist Sync
// Saves watchlists + config to Cosmos DB via Azure Function so data survives browser clear.
// Uses the existing /api/user/{userKey} endpoints.
//
// Flow:
//   - On load (if userKey set): pull from Cosmos, merge with localStorage
//   - On watchlist change: debounced push to Cosmos
//   - On config change: debounced push to Cosmos

import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'

const DEBOUNCE_MS = 3000  // wait 3s after last change before syncing

export function useCosmosSync() {
  const { config, watchlists, flaggedSymbols, alertSubscriptions, setWatchlists } = useStore()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncHash = useRef<string>('')
  const hasLoadedRef = useRef(false)

  const baseUrl = config.hubUrl?.replace(/\/api\/?$/, '').replace(/\/$/, '') || ''
  const userKey = config.userKey

  // Load from Cosmos on mount (if userKey is set and localStorage is empty/default)
  useEffect(() => {
    if (!userKey || !baseUrl || hasLoadedRef.current) return
    hasLoadedRef.current = true

    async function loadFromCosmos() {
      try {
        const url = proxyUrl(`${baseUrl}/api/user/${encodeURIComponent(userKey)}`)
        const response = await fetch(url)
        if (!response.ok) {
          console.log('CosmosSync: No cloud data found for user', userKey)
          return
        }

        const data = await response.json()
        console.log('CosmosSync: Loaded cloud data for user', userKey)

        // Only restore watchlists if localStorage has the default single empty watchlist
        if (data.watchlists && Array.isArray(data.watchlists) && data.watchlists.length > 0) {
          const localWatchlists = useStore.getState().watchlists
          const isDefault = localWatchlists.length === 1
            && localWatchlists[0].name === 'Main'
            && localWatchlists[0].symbols.length === 0

          if (isDefault) {
            console.log('CosmosSync: Restoring watchlists from cloud (local was default)')
            setWatchlists(data.watchlists)
          } else {
            console.log('CosmosSync: Local watchlists exist, not overwriting from cloud')
          }
        }
      } catch (err) {
        console.log('CosmosSync: Failed to load cloud data', err)
      }
    }

    loadFromCosmos()
  }, [userKey, baseUrl, setWatchlists])

  // Save to Cosmos on watchlist/config changes (debounced)
  const syncToCosmos = useCallback(async () => {
    if (!userKey || !baseUrl) return

    const state = useStore.getState()

    // Convert Zustand watchlist format to backend format:
    // Backend expects: { "WatchlistName": ["SYM1", "SYM2"] }
    // Zustand has: [{ id, name, symbols: [{ symbol, upperAlert, ... }] }]
    const watchlistsForBackend: Record<string, string[]> = {}
    for (const wl of state.watchlists) {
      watchlistsForBackend[wl.name] = wl.symbols.map(s => s.symbol)
    }

    const payload = {
      watchlists: watchlistsForBackend,
      configs: {
        tradingViewId: state.config.tradingViewId,
        audioEnabled: String(state.config.audioEnabled),
        ttsEnabled: String(state.config.ttsEnabled),
        theme: state.config.theme,
        excludeFilings: state.config.excludeFilings || '',
        filteredPrPositive: state.config.filteredPrPositive || '',
        filteredPrNegative: state.config.filteredPrNegative || '',
        showAllTradeExchange: String(state.config.showAllTradeExchange),
        hubUrl: state.config.hubUrl,
        marketCapMin: String(state.config.marketCapMin),
        marketCapMax: String(state.config.marketCapMax),
      },
    }

    // Skip if nothing changed
    const hash = JSON.stringify(payload)
    if (hash === lastSyncHash.current) return
    lastSyncHash.current = hash

    try {
      const url = proxyUrl(`${baseUrl}/api/user/${encodeURIComponent(userKey)}`)
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      console.log('CosmosSync: Saved to cloud')
    } catch (err) {
      console.log('CosmosSync: Failed to save to cloud', err)
    }
  }, [userKey, baseUrl])

  // Watch for changes and debounce sync
  useEffect(() => {
    if (!userKey) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(syncToCosmos, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [watchlists, flaggedSymbols, alertSubscriptions, config.theme, config.excludeFilings,
    config.filteredPrPositive, config.filteredPrNegative, config.showAllTradeExchange,
    config.ttsEnabled, config.audioEnabled, syncToCosmos, userKey])
}
