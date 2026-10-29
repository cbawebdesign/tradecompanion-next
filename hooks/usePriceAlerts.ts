"use client"

// Price alert checking — uses Zustand subscribe() to avoid React re-renders on every quote tick.
// Previously this ran as a useEffect with [quotes] dependency = firing every 250ms.

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { handleAlertAudio } from '@/lib/alertAudio'

export const CLEAR_AFTER_MS = 5000

type AlertField = 'upperAlert' | 'lowerAlert'

// Justin: after an alert fires, flash the cell for ~5 sec, then null out
// the threshold so stale alerts don't linger on the watchlist UI.
//
// Keyed on the alert key (side + symbol + price), not symbol + side: if 150.20
// fires and he types 151 which fires inside the same 5 seconds, the second
// clear must still be scheduled or 151 is left flashing for good.
const pendingClears = new Set<string>()

export function scheduleAlertClear(symbol: string, field: AlertField, value: number, alertKey: string) {
  if (pendingClears.has(alertKey)) return
  pendingClears.add(alertKey)
  setTimeout(() => {
    pendingClears.delete(alertKey)
    const state = useStore.getState()
    // Only clear the price that fired. If he retyped the box during the
    // flash, that new level is his and must survive.
    for (const wl of state.watchlists) {
      const target = wl.symbols.find((s) => s.symbol === symbol)
      if (target && target[field] === value) {
        state.updateSymbolInWatchlist(wl.id, { ...target, [field]: null })
      }
    }
    // Same auto-clear for an alert held outside any watchlist, or a
    // flagged-only alert would re-fire on every tick after it triggered.
    if (state.standaloneAlerts?.[symbol]?.[field] === value) {
      state.setPriceAlertFromTimeline(symbol, field, null)
    }
    // Justin (Price Alerts Bug): "once there is a triggered price on the day,
    // TC always thinks that same price is triggered no matter where the
    // current price is." The flash was driven by membership of this set, and
    // nothing ever removed a key from it — so re-entering 150.20 at 149 lit
    // up at once. Dropping the key ends the flash and lets the level be armed
    // again; it next fires only when the price actually reaches it.
    state.removeTriggeredPriceAlert(alertKey)
  }, CLEAR_AFTER_MS)
}

/** One pass over every armed alert against the current quotes. */
export function evaluatePriceAlerts(state: ReturnType<typeof useStore.getState>) {
  const { watchlists, triggeredPriceAlerts, addAlert, addTriggeredPriceAlert, config } = state

  // Watchlist entries, plus alerts held for symbols that are on no
  // watchlist at all (flagged-only). Before standaloneAlerts existed the
  // store had to ADD such a symbol to a watchlist for its alert to ever be
  // evaluated here, which is what quietly reorganised Justin's lists.
  const standalone = Object.entries(state.standaloneAlerts ?? {}).map(
    ([symbol, a]) => ({ symbol, upperAlert: a.upperAlert, lowerAlert: a.lowerAlert }),
  )
  const groups: Array<{ symbols: Array<{ symbol: string; upperAlert: number | null; lowerAlert: number | null }> }> =
    [...watchlists.map((w) => ({ symbols: w.symbols as any })), { symbols: standalone }]

  // Only check symbols that actually have price alerts set (skip the rest)
  for (const watchlist of groups) {
    for (const item of watchlist.symbols) {
      const hasUpper = item.upperAlert && item.upperAlert > 0
      const hasLower = item.lowerAlert && item.lowerAlert > 0
      if (!hasUpper && !hasLower) continue

      const quote = state.quotes[item.symbol]
      if (!quote || !quote.last || quote.last <= 0) continue
      // Only a real print can fire an alert. A seeded row is yesterday's close
      // and a snapshot row can be a minute old — either one put a stock that
      // was trading over $4.80 below Justin's $4.72 lower alert. A level the
      // stock really reaches is crossed by a live print anyway.
      if (quote.seeded || quote.snapshot) continue

      const currentLast = quote.last

      if (hasUpper && currentLast >= item.upperAlert!) {
        const alertKey = `upper-${item.symbol}-${item.upperAlert}`
        if (!triggeredPriceAlerts.has(alertKey)) {
          console.log(`PRICE ALERT: ${item.symbol} hit upper $${item.upperAlert} (now $${currentLast})`)
          addAlert({
            id: crypto.randomUUID(),
            dedupKey: `${alertKey}-${Date.now()}`,
            source: 'usePriceAlerts',
            symbol: item.symbol,
            message: `Price hit upper alert $${item.upperAlert!.toFixed(2)} (now $${currentLast.toFixed(2)})`,
            type: 'price',
            color: '#4caf50',
            timestamp: new Date(),
            read: false,
          })
          addTriggeredPriceAlert(alertKey)
          handleAlertAudio('price', `${item.symbol} upper alert`, config)
          scheduleAlertClear(item.symbol, 'upperAlert', item.upperAlert!, alertKey)
        }
      }

      if (hasLower && currentLast <= item.lowerAlert!) {
        const alertKey = `lower-${item.symbol}-${item.lowerAlert}`
        if (!triggeredPriceAlerts.has(alertKey)) {
          console.log(`PRICE ALERT: ${item.symbol} hit lower $${item.lowerAlert} (now $${currentLast})`)
          addAlert({
            id: crypto.randomUUID(),
            dedupKey: `${alertKey}-${Date.now()}`,
            source: 'usePriceAlerts',
            symbol: item.symbol,
            message: `Price hit lower alert $${item.lowerAlert!.toFixed(2)} (now $${currentLast.toFixed(2)})`,
            type: 'price',
            color: '#f44336',
            timestamp: new Date(),
            read: false,
          })
          addTriggeredPriceAlert(alertKey)
          handleAlertAudio('price', `${item.symbol} lower alert`, config)
          scheduleAlertClear(item.symbol, 'lowerAlert', item.lowerAlert!, alertKey)
        }
      }
    }
  }
}

export function usePriceAlerts() {
  useEffect(() => {
    // Subscribe to ALL store changes OUTSIDE React's render cycle.
    // We only care about quote changes, so we track the quotes reference.
    let prevQuotesRef = useStore.getState().quotes

    const unsub = useStore.subscribe((state) => {
      // Skip if quotes reference hasn't changed
      if (state.quotes === prevQuotesRef) return
      prevQuotesRef = state.quotes

      evaluatePriceAlerts(state)
    })

    return () => unsub()
  }, [])
}
