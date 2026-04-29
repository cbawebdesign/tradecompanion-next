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
  type: 'price' | 'filing' | 'news' | 'catalyst' | 'trade_exchange' | 'scanner' | 'tweet' | 'tradingview' | 'rss' | 'mail'
  color: string
  timestamp: Date
  read: boolean
  url?: string
  dedupKey?: string  // explicit dedup key from source (e.g., filing dcn, tweet id, catalyst saveTime)
  source?: string    // which hook/source created this alert
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

// Theme type
export type AppTheme = 'dark' | 'blue' | 'wallst' | 'crimson' | 'nebula'

// Mascot types
export type MascotSize = 'sm' | 'md' | 'lg'
export type MascotCharacter = 'classic' | 'bullish' | 'shouting'

// Config types
export interface AppConfig {
  tradingViewId: string
  apiKey: string
  hubUrl: string
  audioEnabled: boolean
  ttsEnabled: boolean
  alertBarHeight: number
  alertBarHeightPercent: number  // 10-60, % of viewport height; preferred over alertBarHeight
  watchlistSplitPercent: number
  flaggedListSplitPercent: number  // independent split for the Flagged Symbols view
  marketCapMin: number
  marketCapMax: number
  theme: AppTheme
  grokApiKey: string
  userKey: string
  mascotEnabled: boolean
  mascotSize: MascotSize
  mascotCharacter: MascotCharacter
  newsApiKey: string
  excludeFilings: string  // pipe-separated form types to exclude (e.g. "SC 13G|4|D")
  excludePrPatterns: string  // pipe-separated regex alternation for ambulance-chaser / class-action PR blacklist (empty = use default)
  filteredPrPositive: string  // comma=OR, &=AND, !=NOT, *=wildcard
  filteredPrNegative: string
  showAllTradeExchange: boolean  // show unfiltered trade exchange posts
  xShowAllTweets: string  // pipe-separated Twitter usernames whose tweets always pass (e.g. "nolimitgains|citrini7|theshortbear")
  ahkEnabled: boolean
  ahkUrl: string  // local companion server URL (e.g. http://localhost:9876)
  // Per-type audio settings
  alertSounds: Record<string, { enabled: boolean; frequency: number; duration: number }>
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
