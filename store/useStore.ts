import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, Quote, Watchlist, WatchlistSymbol, AppConfig, ConnectionState } from '@/types'

interface AppState {
  // Connection state
  connectionState: ConnectionState
  setConnectionState: (state: ConnectionState) => void

  // Selected items
  selectedSymbol: string | null
  setSelectedSymbol: (symbol: string | null) => void
  selectedWatchlistId: string | null
  setSelectedWatchlistId: (id: string | null) => void
  activeTab: number
  setActiveTab: (tab: number) => void

  // Alerts
  alerts: Alert[]
  addAlert: (alert: Alert) => void
  markAlertRead: (id: string) => void
  clearAlerts: () => void

  // Quotes (real-time)
  quotes: Record<string, Quote>
  updateQuote: (quote: Quote) => void
  updateQuotes: (quotes: Quote[]) => void

  // Watchlists
  watchlists: Watchlist[]
  addWatchlist: (name: string) => void
  removeWatchlist: (id: string) => void
  addSymbolToWatchlist: (watchlistId: string, symbol: WatchlistSymbol) => void
  removeSymbolFromWatchlist: (watchlistId: string, symbol: string) => void
  updateSymbolInWatchlist: (watchlistId: string, symbol: WatchlistSymbol) => void

  // Flagged symbols
  flaggedSymbols: Set<string>
  toggleFlag: (symbol: string) => void
  isFlagged: (symbol: string) => boolean

  // Config
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => void
}

const defaultConfig: AppConfig = {
  tradingViewId: '',
  apiKey: '',
  hubUrl: 'https://stage.news.scanzzers.com',
  audioEnabled: true,
  alertBarHeight: 200,
  watchlistSplitPercent: 50,
  marketCapMin: 0,
  marketCapMax: 999999999999,
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Connection state
      connectionState: 'disconnected',
      setConnectionState: (connectionState) => set({ connectionState }),

      // Selected items
      selectedSymbol: null,
      setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
      selectedWatchlistId: null,
      setSelectedWatchlistId: (selectedWatchlistId) => set({ selectedWatchlistId }),
      activeTab: 0,
      setActiveTab: (activeTab) => set({ activeTab }),

      // Alerts
      alerts: [],
      addAlert: (alert) => set((state) => ({
        alerts: [alert, ...state.alerts].slice(0, 500) // Keep last 500 alerts
      })),
      markAlertRead: (id) => set((state) => ({
        alerts: state.alerts.map(a => a.id === id ? { ...a, read: true } : a)
      })),
      clearAlerts: () => set({ alerts: [] }),

      // Quotes
      quotes: {},
      updateQuote: (quote) => set((state) => ({
        quotes: { ...state.quotes, [quote.symbol]: quote }
      })),
      updateQuotes: (quotes) => set((state) => {
        const updated = { ...state.quotes }
        quotes.forEach(q => { updated[q.symbol] = q })
        return { quotes: updated }
      }),

      // Watchlists
      watchlists: [
        { id: 'default', name: 'Main', symbols: [] }
      ],
      addWatchlist: (name) => set((state) => ({
        watchlists: [...state.watchlists, { id: crypto.randomUUID(), name, symbols: [] }]
      })),
      removeWatchlist: (id) => set((state) => ({
        watchlists: state.watchlists.filter(w => w.id !== id)
      })),
      addSymbolToWatchlist: (watchlistId, symbol) => set((state) => ({
        watchlists: state.watchlists.map(w =>
          w.id === watchlistId
            ? { ...w, symbols: [...w.symbols, symbol] }
            : w
        )
      })),
      removeSymbolFromWatchlist: (watchlistId, symbolName) => set((state) => ({
        watchlists: state.watchlists.map(w =>
          w.id === watchlistId
            ? { ...w, symbols: w.symbols.filter(s => s.symbol !== symbolName) }
            : w
        )
      })),
      updateSymbolInWatchlist: (watchlistId, symbol) => set((state) => ({
        watchlists: state.watchlists.map(w =>
          w.id === watchlistId
            ? { ...w, symbols: w.symbols.map(s => s.symbol === symbol.symbol ? symbol : s) }
            : w
        )
      })),

      // Flagged symbols
      flaggedSymbols: new Set(),
      toggleFlag: (symbol) => set((state) => {
        const newFlags = new Set(state.flaggedSymbols)
        if (newFlags.has(symbol)) {
          newFlags.delete(symbol)
        } else {
          newFlags.add(symbol)
        }
        return { flaggedSymbols: newFlags }
      }),
      isFlagged: (symbol) => get().flaggedSymbols.has(symbol),

      // Config
      config: defaultConfig,
      updateConfig: (updates) => set((state) => ({
        config: { ...state.config, ...updates }
      })),
    }),
    {
      name: 'trade-companion-storage',
      partialize: (state) => ({
        watchlists: state.watchlists,
        flaggedSymbols: Array.from(state.flaggedSymbols), // Convert Set for storage
        config: state.config,
        selectedWatchlistId: state.selectedWatchlistId,
      }),
      onRehydrateStorage: () => (state) => {
        // Convert flaggedSymbols back to Set after rehydration
        if (state && Array.isArray(state.flaggedSymbols)) {
          state.flaggedSymbols = new Set(state.flaggedSymbols as unknown as string[])
        }
      },
    }
  )
)
