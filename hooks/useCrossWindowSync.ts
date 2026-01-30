"use client"

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'

// This hook syncs Zustand state across browser windows/tabs
// It listens to localStorage changes and triggers a store refresh
export function useCrossWindowSync() {
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Only handle our store's storage key
      if (e.key === 'trade-companion-storage' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (parsed.state) {
            // Get current store actions
            const store = useStore.getState()

            // Update specific parts of state that should sync
            if (parsed.state.watchlists) {
              // Watchlists changed in another window
              useStore.setState({ watchlists: parsed.state.watchlists })
            }
            if (parsed.state.flaggedSymbols) {
              // Convert array back to Set
              const flags = Array.isArray(parsed.state.flaggedSymbols)
                ? new Set(parsed.state.flaggedSymbols)
                : parsed.state.flaggedSymbols
              useStore.setState({ flaggedSymbols: flags })
            }
            if (parsed.state.alerts) {
              useStore.setState({ alerts: parsed.state.alerts })
            }
            if (parsed.state.scannerAlerts) {
              useStore.setState({ scannerAlerts: parsed.state.scannerAlerts })
            }
            if (parsed.state.config) {
              useStore.setState({ config: parsed.state.config })
            }
            if (parsed.state.selectedSymbol !== undefined) {
              useStore.setState({ selectedSymbol: parsed.state.selectedSymbol })
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
