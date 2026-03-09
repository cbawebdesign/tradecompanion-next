"use client"

import { useEffect, useRef, useCallback } from 'react'
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import type { Alert, Quote } from '@/types'

interface NegotiateResult {
  url: string
  accessToken: string
}

const TOKEN_REFRESH_MS = 40 * 60 * 1000    // 40 minutes (tokens expire ~45 min)
const STALE_QUOTE_MS = 3 * 60 * 1000       // 3 minutes — re-sub if no update
const STALE_CHECK_INTERVAL_MS = 30 * 1000   // check every 30 seconds
const QUOTE_BATCH_FLUSH_MS = 250            // flush quote buffer every 250ms

async function negotiate(baseUrl: string, userId: string): Promise<NegotiateResult> {
  // Remove trailing /api/ if present, then add /api/negotiate
  const trimmedUrl = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  const url = `${trimmedUrl}/api/negotiate?userId=${encodeURIComponent(userId)}`

  console.log('SignalR: Negotiating at', url)
  const response = await fetch(proxyUrl(url))

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
  const subscribedSymbolsRef = useRef<string>('') // track what we've subscribed to
  const watchlistsRef = useRef(useStore.getState().watchlists)
  const flaggedRef = useRef(useStore.getState().flaggedSymbols)

  // Token refresh: store latest negotiate result so accessTokenFactory returns fresh token
  const negotiateRef = useRef<NegotiateResult | null>(null)

  // TradingView alert dedup: track alert IDs from Cosmos to prevent replay on reconnect
  const tvAlertIdsRef = useRef<Set<string>>(new Set())

  // Stale quote detection: track last update time per symbol
  const quoteTimestampsRef = useRef<Map<string, number>>(new Map())

  // Quote batching: buffer incoming quotes and flush periodically
  const quoteBatchRef = useRef<Quote[]>([])
  const quoteBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    config,
    setConnectionState,
    addAlert,
    addScannerAlert,
    updateQuotes,
    watchlists,
    flaggedSymbols
  } = useStore()

  // Keep refs in sync
  watchlistsRef.current = watchlists
  flaggedRef.current = flaggedSymbols

  // Batched quote updater — accumulates quotes and flushes every 250ms
  const flushQuoteBatch = useCallback(() => {
    if (quoteBatchRef.current.length === 0) return
    const batch = quoteBatchRef.current
    quoteBatchRef.current = []
    quoteBatchTimerRef.current = null

    // Update stale-quote timestamps
    const now = Date.now()
    batch.forEach(q => quoteTimestampsRef.current.set(q.symbol, now))

    updateQuotes(batch)
  }, [updateQuotes])

  const batchQuoteUpdate = useCallback((quotes: Quote[]) => {
    quoteBatchRef.current.push(...quotes)
    if (!quoteBatchTimerRef.current) {
      quoteBatchTimerRef.current = setTimeout(flushQuoteBatch, QUOTE_BATCH_FLUSH_MS)
    }
  }, [flushQuoteBatch])

  // Subscribe to quotes for all watchlist symbols AND flagged symbols
  // Stable identity — reads from refs, no deps that change on every render
  const subscribeToQuotes = useCallback(async () => {
    const connection = connectionRef.current
    if (!connection || connection.state !== HubConnectionState.Connected) return

    // Combine watchlist symbols and flagged symbols
    const watchlistSymbols = watchlistsRef.current.flatMap(w => w.symbols.map(s => s.symbol))
    const flaggedArray = Array.from(flaggedRef.current)
    const allSymbols = [...watchlistSymbols, ...flaggedArray]
    const uniqueSymbols = Array.from(new Set(allSymbols)).sort()

    // Skip if already subscribed to exactly these symbols
    const symbolKey = uniqueSymbols.join(',')
    if (symbolKey === subscribedSymbolsRef.current) return
    subscribedSymbolsRef.current = symbolKey

    console.log('SignalR: Subscribing to', uniqueSymbols.length, 'symbols')

    // Subscribe one at a time with delay to avoid rate limiting (429)
    for (const symbol of uniqueSymbols) {
      try {
        await connection.invoke('SubL1', symbol)
        // Small delay between subscriptions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150))
      } catch (err) {
        console.error('Failed to subscribe to', symbol, err)
      }
    }
  }, [])

  // Initialize connection
  useEffect(() => {
    if (!config.hubUrl) {
      console.log('SignalR: Missing hubUrl - go to Settings to configure')
      return
    }

    let cancelled = false
    let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null
    let staleQuoteTimer: ReturnType<typeof setInterval> | null = null

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
          negotiateRef.current = await negotiate(config.hubUrl, config.tradingViewId || 'anonymous')

          if (cancelled) return

          connection = new HubConnectionBuilder()
            .withUrl(negotiateRef.current.url, {
              // Dynamic token factory — reads from ref so token refresh works on reconnect
              accessTokenFactory: () => negotiateRef.current?.accessToken || ''
            })
            .withAutomaticReconnect([0, 2000, 10000, 30000])
            .build()

          // Token refresh: re-negotiate every 40 minutes to prevent expiry disconnects
          tokenRefreshTimer = setInterval(async () => {
            try {
              const fresh = await negotiate(config.hubUrl, config.tradingViewId || 'anonymous')
              negotiateRef.current = fresh
              console.log('SignalR: Token refreshed (next reconnect will use new token)')
            } catch (e) {
              console.error('SignalR: Token refresh failed', e)
            }
          }, TOKEN_REFRESH_MS)
        }

        connectionRef.current = connection

        // Connection state handlers
        connection.onreconnecting(async () => {
          console.log('SignalR: Reconnecting...')
          setConnectionState('reconnecting')
          // Re-negotiate on reconnect attempt so the token is fresh
          if (!isLocalHub) {
            try {
              const fresh = await negotiate(config.hubUrl, config.tradingViewId || 'anonymous')
              negotiateRef.current = fresh
              console.log('SignalR: Re-negotiated token for reconnect')
            } catch (e) {
              console.error('SignalR: Re-negotiate on reconnect failed', e)
            }
          }
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
          // Force re-subscribe to quotes
          subscribedSymbolsRef.current = ''
          subscribeToQuotes()
        })

        connection.onclose(() => {
          console.log('SignalR: Disconnected')
          setConnectionState('disconnected')
        })

        // Event handlers - BroadcastQuotes is the main one from QuoteManager
        connection.on('BroadcastQuotes', (data: any[]) => {
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
          batchQuoteUpdate(quotes)
        })

        // BroadcastL1 - legacy format { symbol: { l, b, a, bz, az, t, ti }, ... }
        connection.on('BroadcastL1', (data: Record<string, any>) => {
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
          batchQuoteUpdate(quotes)
        })

        // Broadcast1sBar for 1-second bars
        connection.on('Broadcast1sBar', (data: any[]) => {
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
          batchQuoteUpdate(quotes)
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
          let url: string | undefined = data.url || data.Url || undefined
          const alertStr = data.alert || data.message || ''

          if (alertStr.includes('"url":')) {
            try {
              const parsed = JSON.parse(alertStr.replace(/\n/g, ' ').replace(/\\/g, ' '))
              message = parsed.text || alertStr
              url = url || parsed.url
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

        // Real-time PR/headline alerts from Azure Function CatalystScannerService
        connection.on('BroadcastNews', (data: any) => {
          console.log('BroadcastNews received:', data)
          const symbol = data.symbol || data.Symbol || ''
          const headline = data.headline || data.title || data.Title || ''
          const storyId = data.story_id || data.storyId || data.resource_id || ''
          const url = storyId ? `/api/pr?id=${storyId}` : undefined
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol,
            message: headline || `Press Release ${symbol}`,
            type: 'news',
            color: '#7c4dff',
            timestamp: data.savetime_et ? new Date(data.savetime_et) : data.time_et ? new Date(data.time_et) : new Date(),
            read: false,
            url,
          }
          addAlert(alert)
          if (config.audioEnabled) playAlertSound()
        })

        connection.on('tradingViewAlertRaw', (data: any) => {
          console.log('tradingViewAlertRaw received:', data)

          // Dedup by alert ID (prevents replay on reconnect/backfill)
          const alertId = data.id || data.Id || ''
          if (alertId && tvAlertIdsRef.current.has(alertId)) {
            console.log('SignalR: Skipping duplicate TradingView alert:', alertId)
            return
          }
          if (alertId) tvAlertIdsRef.current.add(alertId)

          let rawText = data.raw_text || data.rawText || ''
          // Azure Function sets raw_text = entire POST body.
          // If the body was JSON (e.g. curl test), extract the actual text from it.
          if (rawText && rawText.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(rawText)
              rawText = parsed.raw_text || parsed.text || parsed.message || parsed.alert || rawText
            } catch { /* not JSON, use as-is */ }
          }
          // Extract symbol from first word, strip $ cashtag prefix (same as legacy TradingView.cs)
          const firstWord = (rawText.split(' ')[0] || '').replace(/^\$/, '').toUpperCase()
          const symbol = /^[A-Z]{1,5}$/.test(firstWord) ? firstWord : ''
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol,
            message: rawText || JSON.stringify(data),
            type: 'news',
            color: '#4caf50',
            timestamp: data.received_utc ? new Date(data.received_utc) : new Date(),
            read: false,
          }
          addAlert(alert)
          if (config.audioEnabled) playAlertSound()
        })

        // Scanner alerts - 4%+ movers (only goes to Scanner page, not AlertBar)
        connection.on('ScannerAlert', (data: any) => {
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

        // TradingView backfill: fetch recent alerts and seed dedup set
        if (config.tradingViewId && !isLocalHub) {
          try {
            const trimmedUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
            const backfillUrl = `${trimmedUrl}/api/tv/alerts?userid=${encodeURIComponent(config.tradingViewId)}`
            console.log('SignalR: TradingView backfill from', backfillUrl)
            const resp = await fetch(proxyUrl(backfillUrl))
            if (resp.ok) {
              const alerts = await resp.json()
              if (Array.isArray(alerts)) {
                console.log(`SignalR: TradingView backfill got ${alerts.length} alerts`)
                alerts.forEach((a: any) => {
                  const id = a.id || a.Id || ''
                  if (id) tvAlertIdsRef.current.add(id)
                })
                console.log(`SignalR: TradingView dedup set seeded with ${tvAlertIdsRef.current.size} IDs`)
              }
            }
          } catch (e) {
            console.log('SignalR: TradingView backfill failed (non-critical)', e)
          }
        }

        // Stale quote re-subscription: check every 30s for symbols with no update in >3 min
        staleQuoteTimer = setInterval(async () => {
          const conn = connectionRef.current
          if (!conn || conn.state !== HubConnectionState.Connected) return
          const now = Date.now()
          const staleSymbols: string[] = []

          // Get all currently subscribed symbols
          const currentSymbols = subscribedSymbolsRef.current.split(',').filter(Boolean)
          for (const sym of currentSymbols) {
            const lastUpdate = quoteTimestampsRef.current.get(sym)
            if (!lastUpdate || (now - lastUpdate) > STALE_QUOTE_MS) {
              staleSymbols.push(sym)
            }
          }

          if (staleSymbols.length > 0) {
            console.log(`SignalR: Re-subscribing to ${staleSymbols.length} stale symbols:`, staleSymbols.join(','))
            for (const sym of staleSymbols) {
              try {
                await conn.invoke('SubL1', sym)
                await new Promise(resolve => setTimeout(resolve, 100))
              } catch (err) {
                console.error('SignalR: Re-sub failed for', sym, err)
              }
            }
          }
        }, STALE_CHECK_INTERVAL_MS)

      } catch (err) {
        console.error('SignalR: Connection failed', err)
        setConnectionState('disconnected')
      }
    }

    connect()

    // Cleanup
    return () => {
      cancelled = true
      if (tokenRefreshTimer) clearInterval(tokenRefreshTimer)
      if (staleQuoteTimer) clearInterval(staleQuoteTimer)
      if (quoteBatchTimerRef.current) clearTimeout(quoteBatchTimerRef.current)
      if (connectionRef.current) {
        connectionRef.current.stop()
      }
    }
  }, [config.hubUrl, config.tradingViewId])

  // Resubscribe when watchlists or flagged symbols actually change
  const symbolKey = [
    ...watchlists.flatMap(w => w.symbols.map(s => s.symbol)),
    ...Array.from(flaggedSymbols),
  ].sort().join(',')

  useEffect(() => {
    subscribeToQuotes()
  }, [symbolKey, subscribeToQuotes])

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
