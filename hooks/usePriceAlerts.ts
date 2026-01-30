"use client"

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import type { Alert } from '@/types'

export function usePriceAlerts() {
  const {
    quotes,
    watchlists,
    addAlert,
    triggeredPriceAlerts,
    addTriggeredPriceAlert,
    config,
  } = useStore()

  useEffect(() => {
    // Check each watchlist symbol for price alert triggers
    watchlists.forEach(watchlist => {
      watchlist.symbols.forEach(item => {
        const quote = quotes[item.symbol]
        if (!quote || !quote.last || quote.last <= 0) return

        const currentLast = quote.last

        // Check upper alert - trigger when price is at or above the level
        if (item.upperAlert && item.upperAlert > 0) {
          const alertKey = `upper-${item.symbol}-${item.upperAlert}`

          if (currentLast >= item.upperAlert) {
            if (!triggeredPriceAlerts.has(alertKey)) {
              console.log(`PRICE ALERT: ${item.symbol} hit upper $${item.upperAlert} (now $${currentLast})`)
              const alert: Alert = {
                id: crypto.randomUUID(),
                symbol: item.symbol,
                message: `Price hit upper alert $${item.upperAlert.toFixed(2)} (now $${currentLast.toFixed(2)})`,
                type: 'price',
                color: '#4caf50',
                timestamp: new Date(),
                read: false,
              }
              addAlert(alert)
              addTriggeredPriceAlert(alertKey)

              if (config.audioEnabled) {
                playPriceAlertSound()
              }
            }
          }
        }

        // Check lower alert - trigger when price is at or below the level
        if (item.lowerAlert && item.lowerAlert > 0) {
          const alertKey = `lower-${item.symbol}-${item.lowerAlert}`

          if (currentLast <= item.lowerAlert) {
            if (!triggeredPriceAlerts.has(alertKey)) {
              console.log(`PRICE ALERT: ${item.symbol} hit lower $${item.lowerAlert} (now $${currentLast})`)
              const alert: Alert = {
                id: crypto.randomUUID(),
                symbol: item.symbol,
                message: `Price hit lower alert $${item.lowerAlert.toFixed(2)} (now $${currentLast.toFixed(2)})`,
                type: 'price',
                color: '#f44336',
                timestamp: new Date(),
                read: false,
              }
              addAlert(alert)
              addTriggeredPriceAlert(alertKey)

              if (config.audioEnabled) {
                playPriceAlertSound()
              }
            }
          }
        }
      })
    })
  }, [quotes, watchlists, addAlert, triggeredPriceAlerts, addTriggeredPriceAlert, config.audioEnabled])
}

// Different sound for price alerts
function playPriceAlertSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Higher pitch for price alerts
    oscillator.frequency.value = 1200
    oscillator.type = 'sine'
    gainNode.gain.value = 0.15

    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.15)
  } catch (e) {
    // Audio not supported or blocked
  }
}
