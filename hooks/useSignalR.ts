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
    updateQuotes,
    watchlists
  } = useStore()

  // Subscribe to quotes for all watchlist symbols
  const subscribeToQuotes = useCallback(async () => {
    const connection = connectionRef.current
    if (!connection || connection.state !== HubConnectionState.Connected) return

    const allSymbols = watchlists.flatMap(w => w.symbols.map(s => s.symbol))
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
  }, [watchlists])

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

        // Step 1: Call negotiate endpoint to get actual SignalR URL + token
        const negotiateResult = await negotiate(config.hubUrl, config.tradingViewId || 'anonymous')

        if (cancelled) return

        // Step 2: Build connection with the negotiated URL and token
        const connection = new HubConnectionBuilder()
          .withUrl(negotiateResult.url, {
            accessTokenFactory: () => negotiateResult.accessToken
          })
          .withAutomaticReconnect([0, 2000, 10000, 30000])
          .build()

        connectionRef.current = connection

        // Connection state handlers
        connection.onreconnecting(() => {
          console.log('SignalR: Reconnecting...')
          setConnectionState('reconnecting')
        })

        connection.onreconnected(() => {
          console.log('SignalR: Reconnected')
          setConnectionState('connected')
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

        connection.on('newFiling', (data: any) => {
          console.log('newFiling received:', data)
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: data.symbol || data.Symbol || data.s,
            message: `Filing: ${data.title || data.Title || data.form_type}`,
            type: 'filing',
            color: '#00bcd4',
            timestamp: new Date(),
            read: false,
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
            symbol: data.symbol || data.Symbol || data.s,
            message: data.description || data.Description || data.msg,
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

        // Scanner alerts - 4%+ movers
        connection.on('ScannerAlert', (data: any) => {
          console.log('ScannerAlert received:', data)
          const direction = data.pctChange > 0 ? '▲' : '▼'
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol: data.symbol || '',
            message: `${direction} ${Math.abs(data.pctChange).toFixed(1)}% ($${data.price?.toFixed(2)}) [${data.session}] [${data.bucket}]`,
            type: 'scanner',
            color: data.pctChange > 0 ? '#4caf50' : '#f44336',
            timestamp: new Date(),
            read: false,
          }
          addAlert(alert)

          if (config.audioEnabled) playAlertSound()
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
