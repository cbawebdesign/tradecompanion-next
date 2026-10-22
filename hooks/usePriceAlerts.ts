"use client"

// Price alert checking — uses Zustand subscribe() to avoid React re-renders on every quote tick.
// Previously this ran as a useEffect with [quotes] dependency = firing every 250ms.

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { handleAlertAudio } from '@/lib/alertAudio'

const CLEAR_AFTER_MS = 5000

// Justin: after an alert fires, flash the cell for ~5 sec, then null out
// the threshold so stale alerts don't linger on the watchlist UI.
const pendingClears = new Set<string>()
function scheduleAlertClear(symbol: string, field: 'upperAlert' | 'lowerAlert') {
  const key = `${field}|${symbol}`
  if (pendingClears.has(key)) return
  pendingClears.add(key)
  setTimeout(() => {
    pendingClears.delete(key)
    const state = useStore.getState()
    for (const wl of state.watchlists) {
      const target = wl.symbols.find((s) => s.symbol === symbol)
      if (target && target[field] != null) {
        state.updateSymbolInWatchlist(wl.id, { ...target, [field]: null })
      }
    }
    // Same auto-clear for an alert held outside any watchlist, or a
    // flagged-only alert would re-fire on every tick after it triggered.
    if (state.standaloneAlerts?.[symbol]?.[field] != null) {
      state.setPriceAlertFromTimeline(symbol, field, null)
    }
  }, CLEAR_AFTER_MS)
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

          const currentLast = quote.last

          if (hasUpper && currentLast >= item.upperAlert!) {
            const alertKey = `upper-${item.symbol}-${item.upperAlert}`
            if (!triggeredPriceAlerts.has(alertKey)) {
              console.log(`PRICE ALERT: ${item.symbol} hit upper $${item.upperAlert} (now $${currentLast})`)
              addAlert({
                id: crypto.randomUUID(),
                dedupKey: alertKey,
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
              scheduleAlertClear(item.symbol, 'upperAlert')
            }
          }

          if (hasLower && currentLast <= item.lowerAlert!) {
            const alertKey = `lower-${item.symbol}-${item.lowerAlert}`
            if (!triggeredPriceAlerts.has(alertKey)) {
              console.log(`PRICE ALERT: ${item.symbol} hit lower $${item.lowerAlert} (now $${currentLast})`)
              addAlert({
                id: crypto.randomUUID(),
                dedupKey: alertKey,
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
              scheduleAlertClear(item.symbol, 'lowerAlert')
            }
          }
        }
      }
    })

    return () => unsub()
  }, [])
}
