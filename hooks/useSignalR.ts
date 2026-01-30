"use client"

import { useEffect, useRef, useCallback } from 'react'
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr'
import { useStore } from '@/store/useStore'
import type { Alert, Quote } from '@/types'

interface NegotiateResult {
  url: string
  accessToken: string
}

async function negotiate(baseUrl: string, userId: string): Promise<NegotiateResult> {
  // Remove trailing /api/ if present, then add /api/negotiate
  const trimmedUrl = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  const url = `${trimmedUrl}/api/negotiate?userId=${encodeURIComponent(userId)}`

  console.log('SignalR: Negotiating at', url)
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Negotiate failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  console.log('SignalR: Negotiate success, got URL:', data.url || data.Url)

  return {
    url: data.url || data.Url,
    accessToken: data.accessToken || data.AccessToken
  }
}

export function useSignalR() {
  const connectionRef = useRef<HubConnection | null>(null)
  const {
    config,
    setConnectionState,
    addAlert,
    addScannerAlert,
    updateQuotes,
    watchlists,
    flaggedSymbols
  } = useStore()

  // Subscribe to quotes for all watchlist symbols AND flagged symbols
  const subscribeToQuotes = useCallback(async () => {
    const connection = connectionRef.current
    if (!connection || connection.state !== HubConnectionState.Connected) return

    // Combine watchlist symbols and flagged symbols
    const watchlistSymbols = watchlists.flatMap(w => w.symbols.map(s => s.symbol))
    const flaggedArray = Array.from(flaggedSymbols)
    const allSymbols = [...watchlistSymbols, ...flaggedArray]
    const uniqueSymbols = Array.from(new Set(allSymbols))

    // Subscribe one at a time (that's how SubL1 works on the server)
    for (const symbol of uniqueSymbols) {
      try {
        await connection.invoke('SubL1', symbol)
        console.log('Subscribed to:', symbol)
      } catch (err) {
        console.error('Failed to subscribe to', symbol, err)
      }
    }
  }, [watchlists, flaggedSymbols])

  // Initialize connection
  useEffect(() => {
    if (!config.hubUrl) {
      console.log('SignalR: Missing hubUrl - go to Settings to configure')
      return
    }

    let cancelled = false

    async function connect() {
      try {
        setConnectionState('connecting')

        let connection: HubConnection

        // Check if this is a local hub (localhost) or Azure SignalR (requires negotiate)
        const isLocalHub = config.hubUrl.includes('localhost') || config.hubUrl.includes('127.0.0.1')

        if (isLocalHub) {
          // Direct connection to local hub (e.g., http://localhost:5000/lxhub)
          console.log('SignalR: Connecting directly to local hub:', config.hubUrl)
          connection = new HubConnectionBuilder()
            .withUrl(config.hubUrl)
            .withAutomaticReconnect([0, 2000, 10000, 30000])
            .build()
        } else {
          // Azure SignalR - use negotiate endpoint
          const negotiateResult = await negotiate(config.hubUrl, config.tradingViewId || 'anonymous')

          if (cancelled) return

          connection = new HubConnectionBuilder()
            .withUrl(negotiateResult.url, {
              accessTokenFactory: () => negotiateResult.accessToken
            })
            .withAutomaticReconnect([0, 2000, 10000, 30000])
            .build()
        }

        connectionRef.current = connection

        // Connection state handlers
        connection.onreconnecting(() => {
          console.log('SignalR: Reconnecting...')
          setConnectionState('reconnecting')
        })

        connection.onreconnected(async () => {
          console.log('SignalR: Reconnected')
          setConnectionState('connected')
          // Re-subscribe to alert triggers for local hub
          if (isLocalHub) {
            try {
              await connection.invoke('SubAlertTriggers')
              console.log('SignalR: Re-subscribed to alert triggers')
            } catch (e) {
              console.log('SignalR: SubAlertTriggers failed on reconnect', e)
            }
          }
          subscribeToQuotes()
        })

        connection.onclose(() => {
          console.log('SignalR: Disconnected')
          setConnectionState('disconnected')
        })

        // Event handlers - BroadcastQuotes is the main one from QuoteManager
        connection.on('BroadcastQuotes', (data: any[]) => {
          console.log('BroadcastQuotes received:', data.length, 'quotes')
          const quotes: Quote[] = data.map(q => ({
            symbol: q.s || q.symbol || q.Symbol,
            bid: q.b || q.bid || q.Bid || 0,
            ask: q.a || q.ask || q.Ask || 0,
            last: q.l || q.last || q.Last || 0,
            volume: q.v || q.volume || q.Volume || 0,
            change: q.change || q.Change || 0,
            changePercent: q.changePercent || q.ChangePercent || 0,
            timestamp: new Date(),
          }))
          updateQuotes(quotes)
        })

        // BroadcastL1 - legacy format { symbol: { l, b, a, bz, az, t, ti }, ... }
        connection.on('BroadcastL1', (data: Record<string, any>) => {
          console.log('BroadcastL1 received:', Object.keys(data).length, 'quotes')
          const quotes: Quote[] = Object.entries(data).map(([symbol, q]) => ({
            symbol,
            bid: q.b || 0,
            ask: q.a || 0,
            last: q.l || 0,
            volume: 0,
            change: 0,
            changePercent: 0,
            timestamp: new Date(),
          }))
          updateQuotes(quotes)
        })

        // Broadcast1sBar for 1-second bars
        connection.on('Broadcast1sBar', (data: any[]) => {
          console.log('Broadcast1sBar received:', data.length, 'bars')
          const quotes: Quote[] = data.map(q => ({
            symbol: q.s || q.symbol,
            bid: 0,
            ask: 0,
            last: q.c || q.close || 0, // close price from bar
            volume: q.v || q.volume || 0,
            change: 0,
            changePercent: 0,
            timestamp: new Date(),
          }))
          updateQuotes(quotes)
        })

        // Alert clear handler
        connection.on('broadcastAlertClear', () => {
          console.log('broadcastAlertClear received')
          // Don't auto-clear, just log it
        })

        // Main alert handler - BroadcastAlertTrigger (used by legacy app)
        // AlertTrigger: { time, alert, alertName, watchlist, message, symbol, color }
        connection.on('BroadcastAlertTrigger', (data: any) => {
          console.log('BroadcastAlertTrigger received:', data)

          // Parse JSON alert format: {"text": "...", "url": "..."}
          let message = ''
          let url: string | undefined
          const alertStr = data.alert || ''
          const alertName = data.alertName || 'Alert'

          if (alertStr.includes('"url":')) {
            try {
              const parsed = JSON.parse(alertStr.replace(/\n/g, ' ').replace(/\\/g, ' '))
              message = parsed.text || alertStr
              url = parsed.url
            } catch {
              message = alertStr
            }
          } else {
            message = data.message || alertStr
          }

          // Determine alert type from alertName
          let alertType: Alert['type'] = 'news'
          const lowerName = alertName.toLowerCase()
          if (lowerName.includes('filing') || lowerName.includes('pr')) {
            alertType = 'filing'
          } else if (lowerName.includes('catalyst')) {
            alertType = 'catalyst'
          } else if (lowerName.includes('trade')) {
            alertType = 'trade_exchange'
          }

          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: data.symbol || '',
            message,
            type: alertType,
            color: data.color || '#4caf50',
            timestamp: new Date(data.time) || new Date(),
            read: false,
            url,
          }
          addAlert(alert)

          if (config.audioEnabled) playAlertSound()
        })

        // Specific event handlers (alternative to BroadcastAlertTrigger)
        connection.on('newFiling', (data: any) => {
          console.log('newFiling received:', data)
          let message = ''
          let url: string | undefined
          const alertStr = data.alert || data.message || ''

          if (alertStr.includes('"url":')) {
            try {
              const parsed = JSON.parse(alertStr.replace(/\n/g, ' ').replace(/\\/g, ' '))
              message = parsed.text || alertStr
              url = parsed.url
            } catch {
              message = alertStr
            }
          } else {
            message = data.title || data.Title || data.form_type || alertStr || 'New Filing'
          }

          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: data.symbol || data.Symbol || data.s || '',
            message,
            type: 'filing',
            color: '#00bcd4',
            timestamp: new Date(),
            read: false,
            url,
          }
          addAlert(alert)
          if (config.audioEnabled) playAlertSound()
        })

        connection.on('newTradeExchange', (data: any) => {
          console.log('newTradeExchange received:', data)
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: data.symbol || data.Symbol || '',
            message: data.content || data.message || data.Message || '',
            type: 'trade_exchange',
            color: '#ff9800',
            timestamp: new Date(),
            read: false,
          }
          addAlert(alert)
          if (config.audioEnabled) playAlertSound()
        })

        connection.on('newCatalystScanner', (data: any) => {
          console.log('newCatalystScanner received:', data)
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: data.symbol || data.Symbol || data.s || '',
            message: data.description || data.Description || data.msg || '',
            type: 'catalyst',
            color: '#9c27b0',
            timestamp: new Date(),
            read: false,
          }
          addAlert(alert)
          if (config.audioEnabled) playAlertSound()
        })

        connection.on('tradingViewAlertRaw', (data: any) => {
          console.log('tradingViewAlertRaw received:', data)
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: '',
            message: data.raw_text || data.rawText || JSON.stringify(data),
            type: 'news',
            color: '#4caf50',
            timestamp: new Date(),
            read: false,
          }
          addAlert(alert)
          if (config.audioEnabled) playAlertSound()
        })

        // Scanner alerts - 4%+ movers (only goes to Scanner page, not AlertBar)
        connection.on('ScannerAlert', (data: any) => {
          console.log('ScannerAlert received:', data)

          // Add to scanner leaderboard only
          addScannerAlert({
            symbol: data.symbol || '',
            pctChange: data.pctChange || 0,
            price: data.price || 0,
            prevClose: data.prevClose || 0,
            session: data.session || 'MKT',
            bucket: data.bucket || null,
            timestamp: data.timestamp || new Date().toISOString(),
          })
        })

        // Start connection
        await connection.start()
        console.log('SignalR: Connected!')
        setConnectionState('connected')

        // Send ping to confirm connection
        try {
          await connection.invoke('Ping')
          console.log('SignalR: Ping sent')
        } catch (e) {
          console.log('SignalR: Ping failed (ok if not supported)', e)
        }

        // Subscribe to alert triggers (only for local hub - Azure doesn't have this)
        if (isLocalHub) {
          try {
            await connection.invoke('SubAlertTriggers')
            console.log('SignalR: Subscribed to alert triggers')
          } catch (e) {
            console.log('SignalR: SubAlertTriggers failed', e)
          }
        }

        // Subscribe to quotes
        subscribeToQuotes()

      } catch (err) {
        console.error('SignalR: Connection failed', err)
        setConnectionState('disconnected')
      }
    }

    connect()

    // Cleanup
    return () => {
      cancelled = true
      if (connectionRef.current) {
        connectionRef.current.stop()
      }
    }
  }, [config.hubUrl, config.tradingViewId])

  // Resubscribe when watchlists change
  useEffect(() => {
    subscribeToQuotes()
  }, [subscribeToQuotes])

  return {
    connection: connectionRef.current,
    subscribeToQuotes,
  }
}

// Simple beep sound for alerts
function playAlertSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    gainNode.gain.value = 0.1

    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.1)
  } catch (e) {
    // Audio not supported or blocked
  }
}
