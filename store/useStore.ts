import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, Quote, Watchlist, WatchlistSymbol, AppConfig, ConnectionState, ScannerAlert, AlertSubscription, AlertType } from '@/types'

// Pane identifiers for focus management
export type PaneId = 'watchlist' | 'alertbar' | 'alerts' | 'scanner' | null

interface AppState {
  // Connection state
  connectionState: ConnectionState
  setConnectionState: (state: ConnectionState) => void

  // Focus/Active pane management
  activePane: PaneId
  setActivePane: (pane: PaneId) => void

  // Selected items
  selectedSymbol: string | null
  setSelectedSymbol: (symbol: string | null) => void
  selectedWatchlistId: string | null
  setSelectedWatchlistId: (id: string | null) => void
  activeTab: number
  setActiveTab: (tab: number) => void

  // Chart mode
  chartMode: boolean
  setChartMode: (enabled: boolean) => void
  toggleChartMode: () => void

  // Alerts
  alerts: Alert[]
  addAlert: (alert: Alert) => void
  markAlertRead: (id: string) => void
  clearAlerts: () => void
  hiddenAlertIds: Set<string>
  hideAlert: (id: string) => void
  removeAlert: (id: string) => void

  // Quotes (real-time)
  quotes: Record<string, Quote>
  updateQuote: (quote: Quote) => void
  updateQuotes: (quotes: Quote[]) => void

  // Previous closes for % change calculation
  prevCloses: Record<string, number>
  setPrevCloses: (prevCloses: Record<string, number>) => void

  // Price alert tracking (to avoid duplicate alerts)
  triggeredPriceAlerts: Set<string>
  addTriggeredPriceAlert: (key: string) => void
  clearTriggeredPriceAlerts: () => void

  // Watchlists
  watchlists: Watchlist[]
  setWatchlists: (watchlists: Watchlist[]) => void
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

  // Scanner alerts
  scannerAlerts: ScannerAlert[]
  addScannerAlert: (alert: ScannerAlert) => void
  clearScannerAlerts: () => void

  // Alert subscriptions (what alerts to receive)
  alertSubscriptions: AlertSubscription[]
  addAlertSubscription: (alertType: AlertType, watchlistId: string) => void
  removeAlertSubscription: (id: string) => void
  toggleAlertSubscriptionAudio: (id: string) => void
}

const defaultConfig: AppConfig = {
  tradingViewId: '',
  apiKey: '',
  hubUrl: 'https://tradecompanion3.azurewebsites.net/api',
  audioEnabled: true,
  alertBarHeight: 200,
  watchlistSplitPercent: 50,
  marketCapMin: 0,
  marketCapMax: 999999999999,
  theme: 'blue',
  grokApiKey: '',
  userKey: '',
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Connection state
      connectionState: 'disconnected',
      setConnectionState: (connectionState) => set({ connectionState }),

      // Focus/Active pane management
      activePane: null,
      setActivePane: (activePane) => set({ activePane }),

      // Selected items
      selectedSymbol: null,
      setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
      selectedWatchlistId: null,
      setSelectedWatchlistId: (selectedWatchlistId) => set({ selectedWatchlistId }),
      activeTab: 1, // Default to Alerts tab
      setActiveTab: (activeTab) => set({ activeTab }),

      // Chart mode
      chartMode: false,
      setChartMode: (chartMode) => set({ chartMode }),
      toggleChartMode: () => set((state) => ({ chartMode: !state.chartMode })),

      // Alerts
      alerts: [],
      addAlert: (alert) => set((state) => {
        // Deduplication: check if same symbol + message + type already exists
        const isDuplicate = state.alerts.some(existing =>
          existing.symbol === alert.symbol &&
          existing.message === alert.message &&
          existing.type === alert.type
        )
        if (isDuplicate) {
          console.log('Skipping duplicate alert:', alert.symbol, alert.message.substring(0, 50))
          return state // Don't add duplicate
        }
        return { alerts: [alert, ...state.alerts].slice(0, 500) }
      }),
      markAlertRead: (id) => set((state) => ({
        alerts: state.alerts.map(a => a.id === id ? { ...a, read: true } : a)
      })),
      clearAlerts: () => set({ alerts: [], hiddenAlertIds: new Set() }),
      hiddenAlertIds: new Set(),
      hideAlert: (id) => set((state) => {
        const newHidden = new Set(state.hiddenAlertIds)
        newHidden.add(id)
        return { hiddenAlertIds: newHidden }
      }),
      removeAlert: (id) => set((state) => ({
        alerts: state.alerts.filter(a => a.id !== id)
      })),

      // Quotes
      quotes: {},
      updateQuote: (quote) => set((state) => ({
        quotes: { ...state.quotes, [quote.symbol]: quote }
      })),
      updateQuotes: (quotes) => set((state) => {
        const updated = { ...state.quotes }
        const prevCloses = state.prevCloses
        quotes.forEach(q => {
          // Calculate changePercent if we have prevClose
          const prevClose = prevCloses[q.symbol]
          if (prevClose && prevClose > 0 && q.last > 0) {
            q.change = q.last - prevClose
            q.changePercent = ((q.last - prevClose) / prevClose) * 100
          }
          updated[q.symbol] = q
        })
        return { quotes: updated }
      }),

      // Previous closes
      prevCloses: {},
      setPrevCloses: (prevCloses) => set({ prevCloses }),

      // Price alert tracking
      triggeredPriceAlerts: new Set(),
      addTriggeredPriceAlert: (key) => set((state) => {
        const newSet = new Set(state.triggeredPriceAlerts)
        newSet.add(key)
        return { triggeredPriceAlerts: newSet }
      }),
      clearTriggeredPriceAlerts: () => set({ triggeredPriceAlerts: new Set() }),

      // Watchlists
      watchlists: [
        { id: 'default', name: 'Main', symbols: [] }
      ],
      setWatchlists: (watchlists) => set({ watchlists, selectedWatchlistId: watchlists[0]?.id || null }),
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

      // Scanner alerts
      scannerAlerts: [],
      addScannerAlert: (alert) => set((state) => {
        // Update existing or add new (same symbol + session = update)
        const existingIndex = state.scannerAlerts.findIndex(
          a => a.symbol === alert.symbol && a.session === alert.session
        )
        if (existingIndex >= 0) {
          const updated = [...state.scannerAlerts]
          updated[existingIndex] = alert
          return { scannerAlerts: updated }
        }
        // Add new, keep max 500
        return { scannerAlerts: [alert, ...state.scannerAlerts].slice(0, 500) }
      }),
      clearScannerAlerts: () => set({ scannerAlerts: [] }),

      // Alert subscriptions
      alertSubscriptions: [],
      addAlertSubscription: (alertType, watchlistId) => set((state) => {
        // Check if already exists
        const exists = state.alertSubscriptions.some(
          s => s.alertType === alertType && s.watchlistId === watchlistId
        )
        if (exists) return state

        return {
          alertSubscriptions: [
            ...state.alertSubscriptions,
            {
              id: crypto.randomUUID(),
              alertType,
              watchlistId,
              audioEnabled: true,
            }
          ]
        }
      }),
      removeAlertSubscription: (id) => set((state) => ({
        alertSubscriptions: state.alertSubscriptions.filter(s => s.id !== id)
      })),
      toggleAlertSubscriptionAudio: (id) => set((state) => ({
        alertSubscriptions: state.alertSubscriptions.map(s =>
          s.id === id ? { ...s, audioEnabled: !s.audioEnabled } : s
        )
      })),
    }),
    {
      name: 'trade-companion-storage',
      partialize: (state) => ({
        watchlists: state.watchlists,
        flaggedSymbols: Array.from(state.flaggedSymbols), // Convert Set for storage
        config: state.config,
        selectedWatchlistId: state.selectedWatchlistId,
        alerts: state.alerts,
        scannerAlerts: state.scannerAlerts,
        hiddenAlertIds: Array.from(state.hiddenAlertIds), // Convert Set for storage
        alertSubscriptions: state.alertSubscriptions,
      }),
      onRehydrateStorage: () => (state) => {
        // Convert flaggedSymbols back to Set after rehydration
        if (state && Array.isArray(state.flaggedSymbols)) {
          state.flaggedSymbols = new Set(state.flaggedSymbols as unknown as string[])
        }
        // Convert hiddenAlertIds back to Set after rehydration
        if (state && Array.isArray(state.hiddenAlertIds)) {
          state.hiddenAlertIds = new Set(state.hiddenAlertIds as unknown as string[])
        }
      },
    }
  )
)
