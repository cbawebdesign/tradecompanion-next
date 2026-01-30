// Quote types
export interface Quote {
  symbol: string
  bid: number
  ask: number
  last: number
  volume: number
  change: number
  changePercent: number
  timestamp: Date
}

// Alert types
export interface Alert {
  id: string
  symbol: string
  message: string
  type: 'price' | 'filing' | 'news' | 'catalyst' | 'trade_exchange' | 'scanner'
  color: string
  timestamp: Date
  read: boolean
  url?: string  // URL for filings/PRs/tweets
}

export interface PriceAlert {
  symbol: string
  upperBound: number | null
  lowerBound: number | null
  enabled: boolean
}

// Watchlist types
export interface WatchlistSymbol {
  symbol: string
  upperAlert: number | null
  lowerAlert: number | null
  notes: string
}

export interface Watchlist {
  id: string
  name: string
  symbols: WatchlistSymbol[]
}

// Filing types
export interface Filing {
  id: string
  symbol: string
  title: string
  type: string
  url: string
  timestamp: Date
  summary?: string
}

// Trade Exchange types
export interface TradeExchangePost {
  id: string
  symbol: string
  user: string
  message: string
  timestamp: Date
}

// Catalyst types
export interface Catalyst {
  symbol: string
  type: string
  description: string
  timestamp: Date
}

// TradingView Alert
export interface TradingViewAlert {
  id: string
  symbol: string
  message: string
  timestamp: Date
}

// Scanner Alert types
export type ScannerSession = 'PRE' | 'MKT' | 'AH' | 'ON'
export type ScannerBucket = 'NANO' | 'MICRO' | 'SMALL' | 'MID' | 'LARGE' | 'MEGA' | 'UNKNOWN'

export interface ScannerAlert {
  symbol: string
  pctChange: number
  price: number
  prevClose: number
  session: ScannerSession
  bucket: ScannerBucket | null
  timestamp: string
}

// Config types
export interface AppConfig {
  tradingViewId: string
  apiKey: string
  hubUrl: string
  audioEnabled: boolean
  alertBarHeight: number
  watchlistSplitPercent: number
  marketCapMin: number
  marketCapMax: number
}

// SignalR connection state
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

// Alert subscription types (which alerts to receive)
export type AlertType = 'PRs' | 'Filings' | 'X' | 'FilteredPRs' | 'TradeExchange' | 'TradeExchangeFiltered' | 'AfternoonBreakout' | 'TradingViewWebhooks'

export interface AlertSubscription {
  id: string
  alertType: AlertType
  watchlistId: string
  audioEnabled: boolean
}
