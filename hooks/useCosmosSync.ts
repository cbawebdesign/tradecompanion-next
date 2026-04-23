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

// Module-level handle to the bypass-debounce sync function so any component
// (e.g. SettingsPage's blur/save handlers) can force a flush without
// threading a prop through providers.
let _syncNowHandle: (() => Promise<void>) | null = null
export function forceCosmosSyncNow(): Promise<void> {
  return _syncNowHandle ? _syncNowHandle() : Promise.resolve()
}

export function useCosmosSync() {
  const { config, watchlists, flaggedSymbols, alertSubscriptions, setWatchlists } = useStore()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncHash = useRef<string>('')
  const hasLoadedRef = useRef(false)
  // Track which userKey the current local state belongs to. If the user
  // switches keys (testing someone else's account), wipe user-scoped state
  // before loading so our own settings don't leak up into their Cosmos doc.
  const claimedKeyRef = useRef<string | null>(null)
  // Block sync-up pushes until the first load completes. Prevents a race
  // where the debounce fires with pre-load local state.
  const loadCompleteRef = useRef(false)

  const baseUrl = config.hubUrl?.replace(/\/api\/?$/, '').replace(/\/$/, '') || ''
  const userKey = config.userKey

  // Detect userKey context-switch: if we had a previous key and it just
  // changed, reset user-scoped fields so loadFromCosmos repopulates cleanly
  // from the new user's cloud doc rather than leaking our own state up.
  useEffect(() => {
    if (!userKey) return
    if (claimedKeyRef.current !== null && claimedKeyRef.current !== userKey) {
      console.log(`CosmosSync: userKey changed ${claimedKeyRef.current} → ${userKey} — resetting local state`)
      useStore.setState({
        watchlists: [{ id: 'default', name: 'Main', symbols: [] }],
        selectedWatchlistId: 'default',
        flaggedSymbols: new Set(),
        alertSubscriptions: [],
        config: {
          ...useStore.getState().config,
          excludeFilings: '',
          filteredPrPositive: '',
          filteredPrNegative: '',
          tradingViewId: '',
        },
      })
      hasLoadedRef.current = false
      loadCompleteRef.current = false
      lastSyncHash.current = ''
    }
    claimedKeyRef.current = userKey
  }, [userKey])

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

        // Restore flagged symbols + alert subscriptions from cloud if local is empty
        // (handles the incognito/new-browser case). Stored inside `configs` as JSON
        // strings because that's a free-form dict on the backend.
        const cloudCfg = (data.configs ?? {}) as Record<string, string | undefined>
        const localState = useStore.getState()

        if (localState.flaggedSymbols.size === 0 && cloudCfg.flaggedSymbols) {
          try {
            const arr = JSON.parse(cloudCfg.flaggedSymbols)
            if (Array.isArray(arr) && arr.length > 0) {
              useStore.setState({ flaggedSymbols: new Set(arr) })
              console.log(`CosmosSync: Restored ${arr.length} flagged symbols from cloud`)
            }
          } catch {/* ignore */}
        }

        if (localState.alertSubscriptions.length === 0 && cloudCfg.alertSubscriptions) {
          try {
            const arr = JSON.parse(cloudCfg.alertSubscriptions)
            if (Array.isArray(arr) && arr.length > 0) {
              useStore.setState({ alertSubscriptions: arr })
              console.log(`CosmosSync: Restored ${arr.length} alert subscriptions from cloud`)
            }
          } catch {/* ignore */}
        }

        // Restore config scalars (ExcludeFilings, FilterNews*, TradingViewId, etc.)
        // from cloud when local is empty/default. Previously only flagged / subs /
        // watchlists came down — which meant incognito / new-browser / clear-cache
        // sessions lost every other per-user setting until manually re-entered.
        //
        // Pull-rule per field: only overwrite local if local looks unset AND cloud
        // has a meaningful value. Legacy PascalCase keys fall back to camelCase.
        const cfgPatch: Partial<typeof localState.config> = {}
        const pick = (...keys: string[]) => {
          for (const k of keys) {
            const v = cloudCfg[k]
            if (typeof v === 'string' && v.length > 0) return v
          }
          return undefined
        }
        const ef = pick('excludeFilings', 'ExcludeFilings')
        if (ef && !localState.config.excludeFilings) cfgPatch.excludeFilings = ef

        const fpp = pick('filteredPrPositive', 'FilterNewsPositive')
        if (fpp && !localState.config.filteredPrPositive) cfgPatch.filteredPrPositive = fpp

        const fpn = pick('filteredPrNegative', 'FilterNewsNegative')
        if (fpn && !localState.config.filteredPrNegative) cfgPatch.filteredPrNegative = fpn

        const tvid = pick('tradingViewId', 'TradingViewId')
        if (tvid && !localState.config.tradingViewId) cfgPatch.tradingViewId = tvid

        if (Object.keys(cfgPatch).length > 0) {
          useStore.setState({ config: { ...localState.config, ...cfgPatch } })
          console.log(`CosmosSync: Restored ${Object.keys(cfgPatch).length} config scalars from cloud:`, Object.keys(cfgPatch))
        }
      } catch (err) {
        console.log('CosmosSync: Failed to load cloud data', err)
      } finally {
        // Any debounced payload that the user-change reset scheduled was
        // against pre-load state — seed the hash with the post-load payload
        // so the first sync-up is a true no-op if nothing actually changed.
        loadCompleteRef.current = true
      }
    }

    loadFromCosmos()
  }, [userKey, baseUrl, setWatchlists])

  // Save to Cosmos on watchlist/config changes (debounced)
  const syncToCosmos = useCallback(async () => {
    if (!userKey || !baseUrl) return
    // Block until loadFromCosmos has had a chance to populate local state
    // from the new user's cloud doc. Otherwise the first debounce fires with
    // whatever local leftovers we had and overwrites their record.
    if (!loadCompleteRef.current) {
      console.log('CosmosSync: Skipping sync — load not complete yet')
      return
    }

    const state = useStore.getState()

    // Convert Zustand watchlist format to backend format:
    // Backend expects: { "WatchlistName": ["SYM1", "SYM2"] }
    // Zustand has: [{ id, name, symbols: [{ symbol, upperAlert, ... }] }]
    const watchlistsForBackend: Record<string, string[]> = {}
    for (const wl of state.watchlists) {
      watchlistsForBackend[wl.name] = wl.symbols.map(s => s.symbol)
    }

    // Flattened "symbol → subscribed alert types" map for server-side Phase 2
    // filtering. Backend never sees client-side watchlist UUIDs, just the
    // derived pass-list keyed by uppercased symbol.
    const subscribedAlerts: Record<string, string[]> = {}
    for (const sub of state.alertSubscriptions) {
      const wl = state.watchlists.find(w => w.id === sub.watchlistId)
      if (!wl) continue
      for (const { symbol } of wl.symbols) {
        const key = symbol.toUpperCase()
        const set = subscribedAlerts[key] ?? (subscribedAlerts[key] = [])
        if (!set.includes(sub.alertType)) set.push(sub.alertType)
      }
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
        flaggedSymbols: JSON.stringify(Array.from(state.flaggedSymbols)),
        alertSubscriptions: JSON.stringify(state.alertSubscriptions),
        subscribedAlerts: JSON.stringify(subscribedAlerts),
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

  // Expose a bypass-debounce sync so Settings can flush on textarea blur /
  // explicit save. Also resets the dedup hash so a force-sync always goes
  // out even if the computed payload happens to match the last one.
  const syncNow = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    lastSyncHash.current = ''
    await syncToCosmos()
  }, [syncToCosmos])

  // Publish to the module-level handle so SettingsPage etc. can call it.
  useEffect(() => {
    _syncNowHandle = syncNow
    return () => { if (_syncNowHandle === syncNow) _syncNowHandle = null }
  }, [syncNow])

  return { syncNow }
}
