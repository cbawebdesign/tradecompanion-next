"use client"

// Alert Auditor — Safety net that polls /api/AlertsBySymbol for each watchlisted symbol
// and fires any alert that the real-time hooks missed.
//
// Runs every 60 seconds during market hours.
// This is the "self-healing" layer that ensures Justin never misses an alert.

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import type { Alert } from '@/types'

// Module-level state to survive React remounts
let lastAuditTime: Date | null = null
const seenAlertKeys = new Set<string>()
let hasRun = false

const AUDIT_INTERVAL_MS = 60_000  // 60 seconds
const INITIAL_DELAY_MS = 5 * 60_000  // wait 5 MINUTES before first audit — let all hooks fully settle

// Check if we're in US market hours (Mon-Fri, 4am-8pm ET)
function isMarketHours(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const hour = et.getHours()
  return day >= 1 && day <= 5 && hour >= 4 && hour < 20
}

// Build a dedup key for an alert (matches store.addAlert logic)
function alertKey(symbol: string, type: string, message: string): string {
  return `${symbol}|${type}|${(message || '').substring(0, 40).toLowerCase()}`
}

export function useAlertAuditor() {
  const { config, addAlert, addAlerts, watchlists, alerts } = useStore()
  const watchlistsRef = useRef(watchlists)
  const alertsRef = useRef(alerts)
  watchlistsRef.current = watchlists
  alertsRef.current = alerts

  useEffect(() => {
    if (!config.hubUrl) return

    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    let cancelled = false

    async function audit() {
      if (cancelled || !isMarketHours()) return

      // Get all unique symbols from watchlists
      const symbols = Array.from(new Set(
        watchlistsRef.current.flatMap(w => w.symbols.map(s => s.symbol.toUpperCase()))
      ))

      if (symbols.length === 0) return

      // Build a set of existing alert keys for fast lookup
      const existingKeys = new Set<string>()
      for (const a of alertsRef.current) {
        existingKeys.add(alertKey(a.symbol, a.type, a.message))
      }
      // Also include previously seen auditor keys
      seenAlertKeys.forEach(k => existingKeys.add(k))

      const since = lastAuditTime || new Date(new Date().setHours(0, 0, 0, 0)) // today at midnight
      const sinceStr = since.toISOString()

      const recoveredBatch: Alert[] = []

      // Audit each symbol (sequentially to avoid hammering the API)
      for (const symbol of symbols) {
        if (cancelled) break
        try {
          const url = proxyUrl(`${baseUrl}/api/AlertsBySymbol?symbol=${encodeURIComponent(symbol)}&since=${encodeURIComponent(sinceStr)}`)
          const response = await fetch(url)
          if (!response.ok) continue

          const data = await response.json()

          const typeMap: Record<string, { items: any[]; alertType: Alert['type']; color: string }> = {
            filings: { items: data.filings || [], alertType: 'filing', color: '#00bcd4' },
            tweets: { items: data.tweets || [], alertType: 'tweet', color: '#1da1f2' },
            tradeExchange: { items: data.tradeExchange || [], alertType: 'trade_exchange', color: '#eab308' },
            tradingView: { items: data.tradingView || [], alertType: 'tradingview', color: '#4caf50' },
            catalysts: { items: data.catalysts || [], alertType: 'catalyst', color: '#f97316' },
          }

          for (const [_typeName, { items, alertType, color }] of Object.entries(typeMap)) {
            for (const item of items) {
              const msg = item.title || item.headline || item.text || item.content || item.raw_text || item.message || ''
              const key = alertKey(symbol, alertType, msg)

              if (existingKeys.has(key)) continue
              existingKeys.add(key)
              seenAlertKeys.add(key)

              recoveredBatch.push({
                id: crypto.randomUUID(),
                symbol,
                message: msg,
                type: alertType,
                color,
                timestamp: new Date(item.time_et || item.save_time_utc || item.created_at || item.received_utc || new Date()),
                read: false,
                url: item.url || item.link || undefined,
              })
            }
          }
        } catch (err) {
          // Silently skip failed symbols
        }
      }

      lastAuditTime = new Date()

      // Re-check against CURRENT store state (not stale ref from start of audit)
      // This prevents "recovering" alerts that other hooks added while we were querying
      if (recoveredBatch.length > 0) {
        const freshAlerts = useStore.getState().alerts
        const freshKeys = new Set<string>()
        for (const a of freshAlerts) {
          freshKeys.add(alertKey(a.symbol, a.type, a.message))
        }
        const trulyMissed = recoveredBatch.filter(a => !freshKeys.has(alertKey(a.symbol, a.type, a.message)))

        if (trulyMissed.length > 0) {
          console.log(`AlertAuditor: recovered ${trulyMissed.length} missed alerts (filtered from ${recoveredBatch.length} candidates)`)
          addAlerts(trulyMissed)
        }
      }

      // Cap seen keys to prevent memory growth
      if (seenAlertKeys.size > 2000) {
        const arr = Array.from(seenAlertKeys)
        seenAlertKeys.clear()
        arr.slice(-1000).forEach(k => seenAlertKeys.add(k))
      }
    }

    // Initial delay then periodic
    const initTimer = setTimeout(() => {
      if (!hasRun) {
        hasRun = true
        audit()
      }
    }, INITIAL_DELAY_MS)

    const interval = setInterval(audit, AUDIT_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      clearInterval(interval)
    }
  }, [config.hubUrl, addAlert])
}
