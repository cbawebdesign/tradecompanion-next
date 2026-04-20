// Central signal/noise gate for the Alerts timeline (Phase 1, client-side).
//
// Rule set per Justin's spec (4/20):
//   - Flagged symbols  → every alert type passes
//   - Watchlists       → pass only if the alert's type is on that watchlist's
//                        subscription list AND the symbol is on that watchlist
//   - Unfiltered types → TradingView / Catalyst / RSS / Mail / Mail-like news /
//                        Price / Scanner always pass regardless of watchlist/flag state

import type { Alert, Watchlist, AlertSubscription, AlertType } from '@/types'

// Alert types that are subject to watchlist subscription gating.
// Anything NOT in this map is considered "unfiltered" and always passes.
export const GATED_TYPES: Record<string, AlertType> = {
  filing: 'Filings',
  news: 'PRs',
  trade_exchange: 'TradeExchange',
  tweet: 'X',
}

// All 4 gated subscription keys (used for the per-watchlist default + UI).
export const GATED_SUBSCRIPTION_KEYS: AlertType[] = ['Filings', 'PRs', 'TradeExchange', 'X']

export const SUBSCRIPTION_LABELS: Record<AlertType, string> = {
  PRs: 'Press Releases',
  Filings: 'SEC Filings',
  X: 'Tweets (X)',
  FilteredPRs: 'Filtered PRs',
  TradeExchange: 'Trade Exchange',
  TradeExchangeFiltered: 'Trade Exchange (Filtered)',
  AfternoonBreakout: 'Afternoon Breakout',
  TradingViewWebhooks: 'TradingView Webhooks',
}

export function shouldShowAlert(
  alert: Alert,
  flaggedSymbols: Set<string>,
  watchlists: Watchlist[],
  subscriptions: AlertSubscription[]
): boolean {
  const subKey = GATED_TYPES[alert.type]
  // Unfiltered alert types always pass (TradingView, catalyst, rss, mail, price, scanner).
  if (!subKey) return true

  const symbol = (alert.symbol || '').toUpperCase()
  if (!symbol) return true // no symbol = can't gate, let it through

  // Rule 1: flagged symbols get every alert, always.
  if (flaggedSymbols.has(symbol)) return true

  // Rule 2: symbol must live on a watchlist that is subscribed to this alert type.
  const subscribedWatchlistIds = new Set(
    subscriptions.filter(s => s.alertType === subKey).map(s => s.watchlistId)
  )
  if (subscribedWatchlistIds.size === 0) return false

  for (const wl of watchlists) {
    if (!subscribedWatchlistIds.has(wl.id)) continue
    if (wl.symbols.some(s => s.symbol.toUpperCase() === symbol)) return true
  }

  return false
}
