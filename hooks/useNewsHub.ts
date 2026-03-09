"use client"

import { useEffect, useRef } from 'react'
import { HubConnectionBuilder, HubConnectionState, HttpTransportType } from '@microsoft/signalr'
import type { HubConnection } from '@microsoft/signalr'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import type { Alert } from '@/types'

const NEWS_HUB_URL = 'https://stage.news.scanzzers.com/newshub'
const MACHINE_LOGIN_URL = 'https://stage.scanzzers.com/auth/machine-login'
const RECONNECT_CHECK_MS = 30_000

// Module-level flag to prevent React Strict Mode double-connect
let hasConnected = false

// Exchange API key for JWT via machine-login endpoint
async function fetchJwt(apiKey: string): Promise<string> {
  const resp = await fetch(proxyUrl(MACHINE_LOGIN_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      machineName: `tc-web-${navigator.userAgent.slice(0, 20)}`,
    }),
  })
  if (!resp.ok) {
    throw new Error(`machine-login failed: ${resp.status}`)
  }
  const jwt = await resp.text()
  // Server may return quoted string
  return jwt.replace(/^"|"$/g, '')
}

export function useNewsHub() {
  const { config, addAlert } = useStore()
  const connectionRef = useRef<HubConnection | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jwtRef = useRef<string>('')

  useEffect(() => {
    const apiKey = config.newsApiKey?.trim()
    if (!apiKey) return
    if (hasConnected) return
    hasConnected = true

    let disposed = false

    async function connect() {
      // Step 1: Exchange API key for JWT
      try {
        console.log('NewsHub: Authenticating...')
        jwtRef.current = await fetchJwt(apiKey!)
        console.log('NewsHub: JWT obtained')
      } catch (err: any) {
        console.error('NewsHub: Auth failed', err?.message || err)
        return
      }

      if (disposed) return

      // Step 2: Build SignalR connection with JWT
      const connection = new HubConnectionBuilder()
        .withUrl(NEWS_HUB_URL, {
          accessTokenFactory: () => jwtRef.current,
          skipNegotiation: true,
          transport: HttpTransportType.WebSockets,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .build()

      connectionRef.current = connection

      // Listen for BroadcastNews — same shape as the Azure Function relay
      connection.on('BroadcastNews', (data: any) => {
        console.log('NewsHub BroadcastNews:', data)
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
          timestamp: data.savetime_et
            ? new Date(data.savetime_et)
            : data.time_et
              ? new Date(data.time_et)
              : new Date(),
          read: false,
          url,
        }
        addAlert(alert)

        // Play audio if enabled
        const audioEnabled = useStore.getState().config.audioEnabled
        if (audioEnabled) {
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = 800
            osc.type = 'sine'
            gain.gain.setValueAtTime(0.3, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.5)
          } catch { /* audio not available */ }
        }
      })

      connection.onclose((err) => {
        if (!disposed) {
          console.log('NewsHub: Connection closed', err?.message || '')
        }
      })

      connection.onreconnecting((err) => {
        console.log('NewsHub: Reconnecting...', err?.message || '')
      })

      connection.onreconnected(() => {
        console.log('NewsHub: Reconnected')
      })

      // Start connection
      try {
        await connection.start()
        console.log('NewsHub: Connected')
      } catch (err: any) {
        console.error('NewsHub: Failed to connect', err?.message || err)
      }

      // Periodic reconnect check — refresh JWT if disconnected
      reconnectTimerRef.current = setInterval(async () => {
        if (disposed) return
        if (connection.state === HubConnectionState.Disconnected) {
          console.log('NewsHub: Reconnect check — refreshing JWT and restarting')
          try {
            jwtRef.current = await fetchJwt(apiKey!)
            await connection.start()
            console.log('NewsHub: Reconnected after JWT refresh')
          } catch (err: any) {
            console.log('NewsHub: Reconnect failed', err?.message || '')
          }
        }
      }, RECONNECT_CHECK_MS)
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      connectionRef.current?.stop().catch(() => {})
      connectionRef.current = null
      hasConnected = false
    }
  }, [config.newsApiKey, addAlert])
}
