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
      if (e.key === 'trade-companion-storage' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (parsed.state) {
            const current = useStore.getState()

            // Only update if data actually changed
            if (parsed.state.watchlists && !isEqual(parsed.state.watchlists, current.watchlists)) {
              useStore.setState({ watchlists: parsed.state.watchlists })
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
              useStore.setState({ alerts: parsed.state.alerts })
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
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])
}
