// Catalyst confirmation gate — ports the legacy CatalystScan logic.
//
// A catalyst headline alone is not an alert. Legacy watches the symbol's
// 1-second bars for up to 45 min after the headline and only fires the
// alert once BOTH of these are true:
//   - cumulative dollar volume since the catalyst > $50k
//   - bar high >= startPrice × priceMult (8% default; legacy varies by mkt cap)
//
// Headlines that never move price/volume silently drop at the 45 min timeout.
// That's why the desktop app shows ~1 catalyst when the web client shows ~20.
//
// Design choices vs. legacy:
//   - Single priceMult of 1.08 instead of per-mkt-cap tiers (web client has no
//     cheap mkt-cap lookup — Azure Function /api/MktCap is currently a stub).
//     1.08 sits between legacy's mid-cap (1.10) and large-cap (1.075). We can
//     iterate once mkt cap is available.
//   - Forward-only. If a polled catalyst's saveTime is several minutes old,
//     the confirmer only sees bars from now forward. Legacy backfills 1-min
//     bars from saveTime to now; we can add that later if needed.
//   - All pending state is module-level so it survives hook remounts.

import type { Alert } from '@/types'

export interface PendingCatalyst {
  symbol: string
  saveTime: Date
  startPrice: number
  title: string
  resourceId?: string
  source: string       // 'polling' | 'signalr'
  expires: Date        // saveTime + TIMEOUT_MINUTES
}

interface ConfirmerCallbacks {
  onConfirmed: (cat: PendingCatalyst, bar: BarLike) => void
  subscribeSymbol: (symbol: string) => void
}

interface BarLike {
  s: string              // symbol
  t?: string | Date      // bar timestamp
  o?: number             // open
  h?: number             // high
  l?: number             // low
  c?: number             // close
  v?: number             // volume
}

const PRICE_MULT = 1.08
const DOLVOL_THRESHOLD = 50_000
const TIMEOUT_MINUTES = 45
const CLEANUP_INTERVAL_MS = 30_000

class CatalystConfirmer {
  private pending: PendingCatalyst[] = []
  private dolVolPerSymbol = new Map<string, number>()
  private subscribedSymbols = new Set<string>()
  private callbacks: ConfirmerCallbacks | null = null
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  setCallbacks(cb: ConfirmerCallbacks) {
    this.callbacks = cb
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS)
    }
  }

  track(input: {
    symbol: string
    saveTime: Date
    startPrice: number
    title: string
    resourceId?: string
    source: string
  }): 'tracked' | 'expired' | 'duplicate' {
    const symbol = input.symbol.toUpperCase()
    const expires = new Date(input.saveTime.getTime() + TIMEOUT_MINUTES * 60_000)
    if (expires <= new Date()) return 'expired'

    const titleKey = (input.title || '').slice(0, 40)
    const dup = this.pending.find(p =>
      p.symbol === symbol &&
      p.saveTime.getTime() === input.saveTime.getTime() &&
      (p.title || '').slice(0, 40) === titleKey
    )
    if (dup) return 'duplicate'

    const cat: PendingCatalyst = {
      symbol,
      saveTime: input.saveTime,
      startPrice: input.startPrice,
      title: input.title,
      resourceId: input.resourceId,
      source: input.source,
      expires,
    }
    this.pending.push(cat)
    this.dolVolPerSymbol.set(symbol, 0)

    if (!this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.add(symbol)
      this.callbacks?.subscribeSymbol(symbol)
    }
    return 'tracked'
  }

  onBar(bar: BarLike) {
    if (!bar?.s) return
    const symbol = bar.s.toUpperCase()
    const match = this.pending.find(p => p.symbol === symbol)
    if (!match) return

    const barTime = bar.t ? (typeof bar.t === 'string' ? new Date(bar.t) : bar.t) : new Date()

    if (barTime >= match.expires) {
      this.drop(match)
      return
    }
    if (barTime < match.saveTime) return

    const avgPrice = ((bar.o ?? bar.c ?? 0) + (bar.c ?? 0)) / 2
    const volume = bar.v ?? 0
    const addedDolVol = avgPrice * volume
    const newDolVol = (this.dolVolPerSymbol.get(symbol) ?? 0) + addedDolVol
    this.dolVolPerSymbol.set(symbol, newDolVol)

    const priceThreshold = match.startPrice * PRICE_MULT
    const high = bar.h ?? bar.c ?? 0

    if (newDolVol > DOLVOL_THRESHOLD && high >= priceThreshold) {
      console.log(
        `[catalyst-confirm] ${symbol} fired — dolVol=$${newDolVol.toFixed(0)} ` +
        `high=${high} >= ${priceThreshold.toFixed(2)} (start=${match.startPrice})`
      )
      this.callbacks?.onConfirmed(match, bar)
      this.drop(match)
    }
  }

  private cleanupExpired() {
    const now = new Date()
    const stillAlive: PendingCatalyst[] = []
    for (const p of this.pending) {
      if (now >= p.expires) {
        console.log(`[catalyst-confirm] ${p.symbol} timed out at 45min — dropped`)
      } else {
        stillAlive.push(p)
      }
    }
    this.pending = stillAlive
    for (const sym of Array.from(this.dolVolPerSymbol.keys())) {
      if (!this.pending.some(p => p.symbol === sym)) {
        this.dolVolPerSymbol.delete(sym)
      }
    }
  }

  private drop(p: PendingCatalyst) {
    this.pending = this.pending.filter(x => x !== p)
    if (!this.pending.some(x => x.symbol === p.symbol)) {
      this.dolVolPerSymbol.delete(p.symbol)
    }
  }

  stats() {
    return {
      pending: this.pending.length,
      subscribed: this.subscribedSymbols.size,
    }
  }
}

export const catalystConfirmer = new CatalystConfirmer()

export function buildConfirmedAlert(cat: PendingCatalyst, bar: BarLike): Alert {
  const priceSuffix = cat.startPrice ? ` ($${cat.startPrice.toFixed(2)})` : ''
  return {
    id: crypto.randomUUID(),
    dedupKey: `cat:${cat.symbol}-${cat.saveTime.toISOString()}`,
    source: `catalystConfirmer:${cat.source}`,
    symbol: cat.symbol,
    message: `${cat.title}${priceSuffix}`,
    type: 'catalyst',
    color: '#00e676',
    timestamp: bar.t ? (typeof bar.t === 'string' ? new Date(bar.t) : bar.t) : new Date(),
    read: false,
    url: cat.resourceId ? `/api/pr?id=${cat.resourceId}` : undefined,
  }
}
