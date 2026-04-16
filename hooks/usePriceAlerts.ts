"use client"

// Price alert checking — uses Zustand subscribe() to avoid React re-renders on every quote tick.
// Previously this ran as a useEffect with [quotes] dependency = firing every 250ms.

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { handleAlertAudio } from '@/lib/alertAudio'

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

      // Only check symbols that actually have price alerts set (skip the rest)
      for (const watchlist of watchlists) {
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
            }
          }
        }
      }
    })

    return () => unsub()
  }, [])
}
