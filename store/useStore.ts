import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, Quote, Watchlist, WatchlistSymbol, AppConfig, ConnectionState, ScannerAlert, AlertSubscription, AlertType } from '@/types'
import { logAlert } from '@/lib/alertLogger'
import { shouldShowAlert, GATED_SUBSCRIPTION_KEYS } from '@/lib/alertFilter'

// Keep the alert timeline in strict chronological order (newest first).
// Backfill races (catalysts poll at 5s, filings at a different cadence, etc.)
// used to land grouped by alert type — users want everything interleaved.
// Alerts without a valid timestamp sort to the bottom.
function sortAlertsByTimestampDesc(alerts: Alert[]): Alert[] {
  return alerts.slice().sort((a, b) => {
    const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime()
    const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime()
    const aValid = !isNaN(ta)
    const bValid = !isNaN(tb)
    if (!aValid && !bValid) return 0
    if (!aValid) return 1
    if (!bValid) return -1
    return tb - ta
  })
}

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
  addAlerts: (alerts: Alert[]) => void
  markAlertRead: (id: string) => void
  clearAlerts: () => void
  // Set when the user explicitly clears the timeline. The alert auditor uses
  // this as a floor for its "since" cutoff so cleared alerts don't get pulled
  // back in by the next backfill. Persisted across reloads — once cleared,
  // gone for the rest of the day.
  clearedSince: number | null
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
  // One-time "pre-Phase-1 all-on seed" guard. Once the user has gone through
  // migration (even if they immediately turned everything off), the seed
  // must never re-run — empty alertSubscriptions is a valid user choice.
  hasMigratedSubs: boolean

  // Mascot
  mascotPosition: { x: number; y: number }
  setMascotPosition: (pos: { x: number; y: number }) => void
}

const defaultAlertSounds: Record<string, { enabled: boolean; frequency: number; duration: number }> = {
  news: { enabled: true, frequency: 800, duration: 150 },
  filing: { enabled: true, frequency: 600, duration: 200 },
  tweet: { enabled: true, frequency: 900, duration: 120 },
  catalyst: { enabled: true, frequency: 700, duration: 180 },
  trade_exchange: { enabled: true, frequency: 750, duration: 150 },
  tradingview: { enabled: true, frequency: 1000, duration: 200 },
  price: { enabled: true, frequency: 1200, duration: 150 },
  rss: { enabled: true, frequency: 500, duration: 250 },
  mail: { enabled: true, frequency: 550, duration: 200 },
}

const defaultConfig: AppConfig = {
  tradingViewId: '',
  apiKey: '',
  hubUrl: 'https://tradecompanion3.azurewebsites.net/api',
  audioEnabled: true,
  ttsEnabled: false,
  alertBarHeight: 200,
  alertBarHeightPercent: 25,
  watchlistSplitPercent: 50,
  flaggedListSplitPercent: 50,
  marketCapMin: 0,
  marketCapMax: 999999999999,
  theme: 'blue',
  grokApiKey: '',
  userKey: '',
  mascotEnabled: true,
  mascotSize: 'md',
  mascotCharacter: 'classic',
  newsApiKey: '',
  excludeFilings: '',
  excludePrPatterns: '',
  filteredPrPositive: '',
  filteredPrNegative: '',
  showAllTradeExchange: false,
  xShowAllTweets: '',
  ahkEnabled: false,
  ahkUrl: 'http://localhost:9876',
  alertSounds: defaultAlertSounds,
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
        // Signal/noise gate — unsubscribed alert types for non-flagged symbols
        // never hit the timeline. Unfiltered types (TradingView/catalyst/rss/mail)
        // always pass. See lib/alertFilter.ts.
        if (!shouldShowAlert(alert, state.flaggedSymbols, state.watchlists, state.alertSubscriptions)) {
          return state
        }
        // Cleared-timeline floor — once the user clicks "Clear All Alerts",
        // anything older than that moment must NOT come back via the
        // auditor / polling backfills / Airtable replays. Real-time alerts
        // (timestamp ≈ now) pass; old backfilled ones get dropped.
        // Alerts with unresolvable timestamps also get dropped — those almost
        // always come from backfill paths missing a source date field, and
        // it's safer to lose a stray real-time alert than dump old items.
        if (state.clearedSince) {
          const ts = alert.timestamp instanceof Date
            ? alert.timestamp.getTime()
            : new Date(alert.timestamp).getTime()
          if (isNaN(ts) || ts < state.clearedSince) return state
        }
        // Dedup: prefer dedupKey (exact, from source), fall back to fuzzy message match
        const isDuplicate = state.alerts.some(existing => {
          if (alert.dedupKey && existing.dedupKey) {
            return alert.dedupKey === existing.dedupKey
          }
          if (existing.symbol !== alert.symbol || existing.type !== alert.type) return false
          if (existing.message === alert.message) return true
          const existFirst = (existing.message || '').slice(0, 40).toLowerCase()
          const newFirst = (alert.message || '').slice(0, 40).toLowerCase()
          if (existFirst.length > 10 && existFirst === newFirst) return true
          return false
        })
        if (isDuplicate) return state
        if (typeof window !== 'undefined') {
          try { logAlert(alert, 'addAlert') } catch {}
        }
        // Sort by timestamp desc (newest first) so backfilled alerts land in
        // chronological order instead of arriving-group-by-type order.
        return { alerts: sortAlertsByTimestampDesc([alert, ...state.alerts]).slice(0, 500) }
      }),
      addAlerts: (newAlerts) => set((state) => {
        // Apply the same subscription gate as addAlert, in bulk.
        let gated = newAlerts.filter(a =>
          shouldShowAlert(a, state.flaggedSymbols, state.watchlists, state.alertSubscriptions)
        )
        // Cleared-timeline floor — applied here too so backfill batches
        // (auditor / new-symbol-backfill / Airtable initial / TX initial)
        // can't drop pre-clear items into the timeline. Items with
        // unresolvable timestamps are dropped too (they're almost always
        // backfill items missing a source date).
        if (state.clearedSince) {
          const floor = state.clearedSince
          gated = gated.filter(a => {
            const ts = a.timestamp instanceof Date
              ? a.timestamp.getTime()
              : new Date(a.timestamp).getTime()
            return !isNaN(ts) && ts >= floor
          })
        }
        if (gated.length === 0) return state
        // Batch dedup: use dedupKey when available, fall back to message key
        const existingDedupKeys = new Set<string>()
        const existingMsgKeys = new Set<string>()
        for (const a of state.alerts) {
          if (a.dedupKey) existingDedupKeys.add(a.dedupKey)
          existingMsgKeys.add(`${a.symbol}|${a.message}|${a.type}`)
        }
        const unique = gated.filter(a => {
          if (a.dedupKey) return !existingDedupKeys.has(a.dedupKey)
          return !existingMsgKeys.has(`${a.symbol}|${a.message}|${a.type}`)
        })
        if (unique.length === 0) return state
        return { alerts: sortAlertsByTimestampDesc([...unique, ...state.alerts]).slice(0, 500) }
      }),
      markAlertRead: (id) => set((state) => ({
        alerts: state.alerts.map(a => a.id === id ? { ...a, read: true } : a)
      })),
      clearAlerts: () => set({ alerts: [], hiddenAlertIds: new Set(), clearedSince: Date.now() }),
      clearedSince: null,
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
        let changed = false
        quotes.forEach(q => {
          // Calculate changePercent if we have prevClose
          const prevClose = prevCloses[q.symbol]
          if (prevClose && prevClose > 0 && q.last > 0) {
            q.change = q.last - prevClose
            q.changePercent = ((q.last - prevClose) / prevClose) * 100
          }
          // Defensive: skip the re-render if only bid/ask drifted. The UI
          // doesn't show those columns and the watchlist table re-rendering
          // for every NBBO tick (across 1500+ subs) was saturating the main
          // thread. Last + change* are the only fields that affect render.
          const prev = updated[q.symbol]
          if (prev
              && prev.last === q.last
              && prev.change === q.change
              && prev.changePercent === q.changePercent
              && prev.volume === q.volume) {
            return // bid/ask-only drift — skip
          }
          updated[q.symbol] = q
          changed = true
        })
        if (!changed) return state
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
      setWatchlists: (watchlists) => set((state) => {
        // Seed "all on" subscriptions for each incoming watchlist only on
        // first-time setup (hasMigratedSubs is false). Once migrated, trust
        // the user's explicit state — don't auto-add back types they turned
        // off just because a restore produced new UUIDs. Users can use
        // addWatchlist (explicit new list) to get auto-seeding for new rows.
        if (state.hasMigratedSubs) {
          return {
            watchlists,
            selectedWatchlistId: watchlists[0]?.id || null,
          }
        }
        const existing = new Set(state.alertSubscriptions.map(s => `${s.watchlistId}|${s.alertType}`))
        const additions: AlertSubscription[] = []
        for (const wl of watchlists) {
          for (const key of GATED_SUBSCRIPTION_KEYS) {
            if (!existing.has(`${wl.id}|${key}`)) {
              additions.push({ id: crypto.randomUUID(), alertType: key, watchlistId: wl.id, audioEnabled: true })
            }
          }
        }
        return {
          watchlists,
          selectedWatchlistId: watchlists[0]?.id || null,
          alertSubscriptions: additions.length > 0
            ? [...state.alertSubscriptions, ...additions]
            : state.alertSubscriptions,
        }
      }),
      addWatchlist: (name) => set((state) => {
        const id = crypto.randomUUID()
        // New watchlists default to subscribed to all gated alert types.
        const newSubs: AlertSubscription[] = GATED_SUBSCRIPTION_KEYS.map(alertType => ({
          id: crypto.randomUUID(),
          alertType,
          watchlistId: id,
          audioEnabled: true,
        }))
        return {
          watchlists: [...state.watchlists, { id, name, symbols: [] }],
          alertSubscriptions: [...state.alertSubscriptions, ...newSubs],
        }
      }),
      removeWatchlist: (id) => set((state) => ({
        watchlists: state.watchlists.filter(w => w.id !== id),
        // Clean up any subscriptions pointing at the removed watchlist.
        alertSubscriptions: state.alertSubscriptions.filter(s => s.watchlistId !== id),
      })),
      addSymbolToWatchlist: (watchlistId, symbol) => set((state) => ({
        // Defensive dedup — if the symbol is already on this watchlist, no-op.
        // Without this, a runaway drag-drop / repeated "copy to watchlist" /
        // any double-fired event could pile up dozens of identical rows.
        // Justin's laptop hit this with 50+ DXYZ rows on one watchlist.
        watchlists: state.watchlists.map(w => {
          if (w.id !== watchlistId) return w
          const upper = symbol.symbol.toUpperCase()
          if (w.symbols.some(s => s.symbol.toUpperCase() === upper)) return w
          return { ...w, symbols: [...w.symbols, symbol] }
        })
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
      hasMigratedSubs: false,
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

      // Mascot
      mascotPosition: { x: 20, y: -200 }, // bottom-left, offset from bottom
      setMascotPosition: (mascotPosition) => set({ mascotPosition }),
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
        hasMigratedSubs: state.hasMigratedSubs,
        // clearedSince intentionally NOT persisted — Justin: "they are gone
        // until a reboot." On reload the gate resets so today's full history
        // is available again via backfill.
        mascotPosition: state.mascotPosition,
        // quotes intentionally NOT persisted — ephemeral real-time data
      // persisting quotes caused localStorage writes every 250ms, blocking main thread
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
        // One-time cleanup: dedup any accumulated duplicate symbols within
        // each watchlist. Justin saw 50+ identical rows for DXYZ on one list,
        // most likely from a runaway drag-drop or repeated "copy to watchlist"
        // before addSymbolToWatchlist had a dedup guard. Keep first
        // occurrence (preserves any per-symbol notes/alerts on that entry).
        if (state && Array.isArray(state.watchlists)) {
          for (const wl of state.watchlists) {
            if (!Array.isArray(wl.symbols)) continue
            const seen = new Set<string>()
            const deduped = []
            for (const s of wl.symbols) {
              const key = s.symbol?.toUpperCase()
              if (!key || seen.has(key)) continue
              seen.add(key)
              deduped.push(s)
            }
            if (deduped.length !== wl.symbols.length) {
              console.log(`Watchlist "${wl.name}": deduped ${wl.symbols.length} → ${deduped.length} symbols`)
              wl.symbols = deduped
            }
          }
        }
        // One-time pre-Phase-1 migration. Gated on hasMigratedSubs so that
        // "user turned everything off" (empty subs by choice) is preserved
        // across reloads instead of re-seeded (Justin's bug).
        //
        // Backfill: older builds didn't persist hasMigratedSubs. For existing
        // users (watchlists already populated OR config.userKey set), treat
        // undefined as "already migrated" — their subs are whatever they are,
        // don't touch. Only truly-fresh browsers (no watchlists, no userKey)
        // with empty subs are eligible to seed.
        if (state) {
          const looksExistingUser =
            (Array.isArray(state.watchlists) && state.watchlists.some(w => w.id !== 'default' || w.symbols.length > 0))
            || !!state.config?.userKey
            || (Array.isArray(state.alerts) && state.alerts.length > 0)

          const shouldSeed =
            !state.hasMigratedSubs
            && !looksExistingUser
            && Array.isArray(state.watchlists) && state.watchlists.length > 0
            && (!Array.isArray(state.alertSubscriptions) || state.alertSubscriptions.length === 0)

          if (shouldSeed) {
            const additions: AlertSubscription[] = []
            for (const wl of state.watchlists) {
              for (const key of GATED_SUBSCRIPTION_KEYS) {
                additions.push({ id: crypto.randomUUID(), alertType: key, watchlistId: wl.id, audioEnabled: true })
              }
            }
            state.alertSubscriptions = additions
          }
          state.hasMigratedSubs = true
        }
      },
    }
  )
)
