"use client"

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'

// Deep-ish equality check (JSON stringify) to avoid unnecessary re-renders
function isEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

// This hook syncs Zustand state across browser windows/tabs
// It listens to localStorage changes and triggers a store refresh
// IMPORTANT: Only updates state when data actually changed to prevent
// polling hooks from re-firing (they depend on watchlists/config)
export function useCrossWindowSync() {
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Only handle our store's storage key
      if (e.key === 'trade-companion-storage' && e.newValue) applyStorageValue(e.newValue)
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])
}

/** Apply another window's persisted state to this one. Exported for tests. */
export function applyStorageValue(newValue: string) {
  try {
    const parsed = JSON.parse(newValue)
    if (parsed.state) {
      const current = useStore.getState()

      // Justin's video (10/29): he typed 75.20 over a flashing 10.01 and
      // a second later it was back to 10.01 and flashing again. Every
      // window persists its WHOLE state; another window that saved for
      // an unrelated reason before it had heard about the edit wrote its
      // old watchlists back, and this handler copied them in. Only a
      // NEWER copy may replace ours. A window still on an old build has
      // no stamp (0) and can no longer overwrite anything.
      const incomingAt = Number(parsed.state.watchlistsUpdatedAt) || 0
      if (incomingAt >= current.watchlistsUpdatedAt) {
        const patch: Record<string, unknown> = {}
        // Only update if data actually changed
        if (parsed.state.watchlists && !isEqual(parsed.state.watchlists, current.watchlists)) {
          patch.watchlists = parsed.state.watchlists
        }
        // Flagged-only price alerts live outside the watchlists, so without
        // this a pop-out kept showing a level the main window had already
        // fired and auto-cleared.
        if (parsed.state.standaloneAlerts && !isEqual(parsed.state.standaloneAlerts, current.standaloneAlerts)) {
          patch.standaloneAlerts = parsed.state.standaloneAlerts
        }
        if (Object.keys(patch).length > 0) {
          // Same setState as the data, so the stamp subscriber sees an
          // incoming change rather than a local one.
          useStore.setState({ ...patch, watchlistsUpdatedAt: Math.max(incomingAt, current.watchlistsUpdatedAt + 1) })
        }
      }
      if (parsed.state.flaggedSymbols) {
        const flags = Array.isArray(parsed.state.flaggedSymbols)
          ? new Set(parsed.state.flaggedSymbols)
          : parsed.state.flaggedSymbols
        const currentFlags = Array.from(current.flaggedSymbols).sort()
        const newFlags = Array.from(flags).sort()
        if (JSON.stringify(currentFlags) !== JSON.stringify(newFlags)) {
          useStore.setState({ flaggedSymbols: flags })
        }
      }
      if (parsed.state.alerts && !isEqual(parsed.state.alerts, current.alerts)) {
        // Respect clearedSince — pop-out windows hydrate with pre-clear
        // state and could otherwise dump old alerts back into a cleared
        // main timeline. Direct setState bypasses addAlert's gate, so
        // re-apply the same rule here.
        let nextAlerts = parsed.state.alerts
        if (current.clearedSince) {
          const floor = current.clearedSince
          nextAlerts = nextAlerts.filter((a: any) => {
            const t = a?.timestamp
            const ts = t instanceof Date ? t.getTime() : new Date(t).getTime()
            return isNaN(ts) || ts >= floor
          })
        }
        useStore.setState({ alerts: nextAlerts })
      }
      if (parsed.state.scannerAlerts && !isEqual(parsed.state.scannerAlerts, current.scannerAlerts)) {
        useStore.setState({ scannerAlerts: parsed.state.scannerAlerts })
      }
      if (parsed.state.config && !isEqual(parsed.state.config, current.config)) {
        useStore.setState({ config: parsed.state.config })
      }
    }
  } catch (err) {
    console.error('Error syncing state across windows:', err)
  }
}
