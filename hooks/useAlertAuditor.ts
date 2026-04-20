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
// Symbols that have had their "first-seen" full-day backfill run this session.
// Prevents re-backfilling the same symbol every time the watchlist reference
// changes (e.g. unrelated mutations). Cleared on page reload.
const backfilledSymbols = new Set<string>()
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

              // Build dedupKey from source data
              const itemId = item.dcn ? `filing:${item.cik}-${item.dcn}`
                : item.id_long ? `tweet:${item.id_long}`
                : item.id ? `tx:${item.id}`
                : item.saveTime_et ? `cat:${symbol}-${item.saveTime_et}`
                : item.story_id ? `pr:${item.story_id}`
                : `audit:${symbol}-${alertType}-${(msg || '').slice(0, 40)}`

              recoveredBatch.push({
                id: crypto.randomUUID(),
                dedupKey: itemId,
                source: 'useAlertAuditor',
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
        const freshDedupKeys = new Set<string>()
        const freshMsgKeys = new Set<string>()
        for (const a of freshAlerts) {
          if (a.dedupKey) freshDedupKeys.add(a.dedupKey)
          freshMsgKeys.add(alertKey(a.symbol, a.type, a.message))
        }
        const trulyMissed = recoveredBatch.filter(a => {
          if (a.dedupKey && freshDedupKeys.has(a.dedupKey)) return false
          if (freshMsgKeys.has(alertKey(a.symbol, a.type, a.message))) return false
          return true
        })

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

    // One-shot backfill for a single symbol from today midnight ET → now.
    // Fires whenever a symbol appears in the watchlist that we haven't backfilled
    // yet this session. This fixes the "add BIRD at 9am, the 8am PR never reaches
    // the timeline" bug — the periodic audit only pulls items since lastAuditTime,
    // never the symbol's full history.
    async function backfillNewSymbol(symbol: string) {
      if (backfilledSymbols.has(symbol)) return
      backfilledSymbols.add(symbol)

      // Start-of-day ET cutoff
      const now = new Date()
      const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const etMidnight = new Date(etNow)
      etMidnight.setHours(0, 0, 0, 0)
      // Convert back to UTC ISO for the API
      const sinceStr = new Date(etMidnight.getTime() + (now.getTime() - etNow.getTime())).toISOString()

      try {
        const url = proxyUrl(`${baseUrl}/api/AlertsBySymbol?symbol=${encodeURIComponent(symbol)}&since=${encodeURIComponent(sinceStr)}`)
        const response = await fetch(url)
        if (!response.ok) return

        const data = await response.json()
        const typeMap: Record<string, { items: any[]; alertType: Alert['type']; color: string }> = {
          filings: { items: data.filings || [], alertType: 'filing', color: '#00bcd4' },
          tweets: { items: data.tweets || [], alertType: 'tweet', color: '#1da1f2' },
          tradeExchange: { items: data.tradeExchange || [], alertType: 'trade_exchange', color: '#eab308' },
          tradingView: { items: data.tradingView || [], alertType: 'tradingview', color: '#4caf50' },
          catalysts: { items: data.catalysts || [], alertType: 'catalyst', color: '#f97316' },
        }

        const batch: Alert[] = []
        for (const [, { items, alertType, color }] of Object.entries(typeMap)) {
          for (const item of items) {
            const msg = item.title || item.headline || item.text || item.content || item.raw_text || item.message || ''
            const itemId = item.dcn ? `filing:${item.cik}-${item.dcn}`
              : item.id_long ? `tweet:${item.id_long}`
              : item.id ? `tx:${item.id}`
              : item.saveTime_et ? `cat:${symbol}-${item.saveTime_et}`
              : item.story_id ? `pr:${item.story_id}`
              : `backfill:${symbol}-${alertType}-${(msg || '').slice(0, 40)}`

            batch.push({
              id: crypto.randomUUID(),
              dedupKey: itemId,
              source: 'useAlertAuditor:new-symbol-backfill',
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

        if (batch.length > 0) {
          // Store's addAlerts already dedups on dedupKey — existing items won't double.
          addAlerts(batch)
          console.log(`AlertAuditor: backfilled ${batch.length} items for new symbol ${symbol}`)
        }
      } catch {
        // Silent — periodic audit will catch up.
      }
    }

    // Track watchlist symbol changes → backfill any new ones immediately.
    function checkForNewSymbols() {
      const symbols = Array.from(new Set(
        watchlistsRef.current.flatMap(w => w.symbols.map(s => s.symbol.toUpperCase()))
      ))
      for (const sym of symbols) {
        if (!backfilledSymbols.has(sym)) {
          void backfillNewSymbol(sym)
        }
      }
    }

    // Run immediately on mount (catches the initial watchlist load) and on each
    // audit tick (catches additions between audits).
    checkForNewSymbols()
    const newSymbolInterval = setInterval(checkForNewSymbols, 5000)

    // Initial delay then periodic (periodic audit stays for ongoing safety-net work).
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
      clearInterval(newSymbolInterval)
    }
  }, [config.hubUrl, addAlert, addAlerts])
}
