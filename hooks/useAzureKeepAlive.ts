"use client"

// Periodically warms the Azure Function paths the user actually hits.
// alwaysOn=true on the App Service plan keeps the worker process up,
// but the .NET function engine inside JITs each code path lazily.
// First-call-per-path = 13-19s spike (measured AAPL=18.79s, NVDA=13.54s).
// We can't fix that on B1, but we can pre-pay the JIT tax in the
// background so the user never feels it.
//
// Pings the two heavy ribbon endpoints (/AlertsBySymbol + /StockData)
// every 4 min using a stable warmup symbol. Both are cheap on a warm
// instance (<1s) but trigger the same code paths the user hits.

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'

const PING_INTERVAL_MS = 4 * 60 * 1000  // 4 min — under the JIT-recycle threshold
const WARMUP_SYMBOL = 'AAPL'

export function useAzureKeepAlive() {
  const hubUrl = useStore((s) => s.config.hubUrl)
  const userKey = useStore((s) => s.config.userKey)

  useEffect(() => {
    if (!hubUrl) return

    const baseUrl = hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const uk = userKey ? `&userKey=${encodeURIComponent(userKey)}` : ''

    // Hit each ribbon code path. Best-effort — failures are silently
    // ignored. We don't await the responses; the goal is purely to
    // keep the function engine's JIT hot for these methods.
    const ping = () => {
      const targets = [
        proxyUrl(`${baseUrl}/api/AlertsBySymbol?symbol=${WARMUP_SYMBOL}${uk}`),
        proxyUrl(`${baseUrl}/api/StockData?symbol=${WARMUP_SYMBOL}`),
      ]
      for (const url of targets) {
        fetch(url, { method: 'GET' }).catch(() => { /* ignore */ })
      }
    }

    // First ping after a small delay so we don't double up with initial mount fetches
    const initTimer = setTimeout(ping, 30_000)
    const interval = setInterval(ping, PING_INTERVAL_MS)

    return () => {
      clearTimeout(initTimer)
      clearInterval(interval)
    }
  }, [hubUrl, userKey])
}
