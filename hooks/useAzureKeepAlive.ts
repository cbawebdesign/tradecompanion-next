"use client"

// Pings the Azure Function every few minutes to keep at least one warm
// instance alive. Cold starts on /AlertsBySymbol and /StockData were the
// dominant cause of intermittent data-ribbon hangs (0.5s-4.3s observed).
// One light request every 4 min is far cheaper than the user-visible
// stutter when an instance has been idle for ~10 min and goes cold.

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'

const PING_INTERVAL_MS = 4 * 60 * 1000  // 4 min — under Azure's ~10 min cold-start threshold

export function useAzureKeepAlive() {
  const hubUrl = useStore((s) => s.config.hubUrl)

  useEffect(() => {
    if (!hubUrl) return

    const baseUrl = hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    // /MktCap is the cheapest endpoint that hits the same Azure Function
    // process — anything that goes through the function host counts as a
    // keep-alive. Tiny response, no DB hit.
    const url = proxyUrl(`${baseUrl}/api/MktCap?symbol=AAPL`)

    const ping = () => {
      fetch(url, { method: 'GET' })
        .catch(() => { /* ignore — keep-alive is best-effort */ })
    }

    // First ping after a small delay so we don't double up with initial mount fetches
    const initTimer = setTimeout(ping, 30_000)
    const interval = setInterval(ping, PING_INTERVAL_MS)

    return () => {
      clearTimeout(initTimer)
      clearInterval(interval)
    }
  }, [hubUrl])
}
