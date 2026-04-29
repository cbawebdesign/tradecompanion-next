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

// Pick the original event time out of whichever field the server sent.
// Missing this is what made every backfilled alert on boot stamp with
// the reboot-time clock. Priority: most-specific first, fall back by type.
function resolveAuditTimestamp(item: any): Date {
  const candidates = [
    item.time,            // ← AlertsBySymbol projection uses this for ALL types
    item.time_et,         // filings / news
    item.savetime_et,     // news (lowercase)
    item.saveTime_et,     // catalysts (camelCase)
    item.save_time,       // filings alt
    item.save_time_utc,   // trade exchange
    item.publication_et,  // news publication time
    item.date,            // filings date
    item.created_at,      // tweets
    item.received_utc,    // TradingView webhooks
  ]
  for (const v of candidates) {
    if (!v) continue
    const d = new Date(v)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

// Build a dedup key that matches what the live polling/SignalR paths produce,
// so audit-recovered items dedup against existing timeline entries instead of
// double-printing. AlertsBySymbol response shape uses `time` for catalysts,
// while polling uses `saveTime_et` — both must produce the same key.
function buildAuditDedupKey(item: any, symbol: string, alertType: string, msg: string): string {
  if (item.dcn) return `filing:${item.cik}-${item.dcn}`
  if (item.id_long) return `tweet:${item.id_long}`
  if (item.id && alertType === 'trade_exchange') return `tx:${item.id}`
  if (alertType === 'catalyst') {
    const t = item.saveTime_et || item.time
    if (t) {
      // Match useCatalystPolling's `cat:${symbol}-${saveTime_et}`
      return `cat:${symbol.toUpperCase()}-${typeof t === 'string' ? t : new Date(t).toISOString()}`
    }
  }
  if (item.story_id) return `pr:${item.story_id}`
  if (item.resource_id) return `pr:${item.resource_id}`
  return `audit:${symbol}-${alertType}-${(msg || '').slice(0, 40)}`
}

// Build the click-through URL for an audited item. AlertsBySymbol's
// projection drops URL fields for tweets and catalysts (only filings
// have a url field), so we have to reconstruct the same way the
// Watchlist data ribbon does — otherwise the auditor's URL-less alert
// dedups and the URL-bearing copy from real-time/polling gets dropped.
function buildAuditUrl(item: any, alertType: string): string | undefined {
  if (item.url) return item.url
  if (item.link) return item.link
  if (alertType === 'catalyst' || alertType === 'news') {
    const id = item.resource_id || item.story_id
    if (id) return `/api/pr?id=${encodeURIComponent(id)}`
  }
  if (alertType === 'tweet') {
    if (item.id_long && item.source) {
      return `https://x.com/${item.source}/status/${item.id_long}`
    }
  }
  return undefined
}

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

      // Floor for what the auditor will fetch. Three sources, take the max:
      //   - lastAuditTime: avoid re-checking what we already audited
      //   - clearedSince:  user clicked "Clear All Alerts" → cleared items
      //                    must NOT come back from a backfill (Justin: "once
      //                    the time line alerts are removed... they are gone
      //                    until a reboot").
      //   - midnight ET:   default lower bound on first audit of the day.
      const cleared = useStore.getState().clearedSince
      const sinceCandidates = [
        lastAuditTime ? lastAuditTime.getTime() : 0,
        cleared || 0,
        new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
      ]
      const since = new Date(Math.max(...sinceCandidates))
      const sinceStr = since.toISOString()

      const recoveredBatch: Alert[] = []

      // Audit each symbol (sequentially to avoid hammering the API)
      for (const symbol of symbols) {
        if (cancelled) break
        try {
          const userKey = config.userKey
          const url = proxyUrl(
            `${baseUrl}/api/AlertsBySymbol?symbol=${encodeURIComponent(symbol)}`
            + `&since=${encodeURIComponent(sinceStr)}`
            + (userKey ? `&userKey=${encodeURIComponent(userKey)}` : '')
          )
          const response = await fetch(url)
          if (!response.ok) continue

          const data = await response.json()

          const typeMap: Record<string, { items: any[]; alertType: Alert['type']; color: string }> = {
            filings: { items: data.filings || [], alertType: 'filing', color: '#00bcd4' },
            tweets: { items: data.tweets || [], alertType: 'tweet', color: '#1da1f2' },
            tradeExchange: { items: data.tradeExchange || [], alertType: 'trade_exchange', color: '#eab308' },
            tradingView: { items: data.tradingView || [], alertType: 'tradingview', color: '#4caf50' },
            // Catalysts intentionally excluded from auditor backfill. The
            // auditor produces alerts that bypass the confirmation gate (no
            // historical bars to evaluate dolVol+price), which surfaces the
            // raw orange "PR happened" entries Justin doesn't want — only
            // the green confirmed ones should appear as catalysts. Real-time
            // path: newCatalystScanner → confirmer.track → green on confirm.
            // Historical PR record is still visible in the data ribbon.
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
                dedupKey: buildAuditDedupKey(item, symbol, alertType, msg),
                source: 'useAlertAuditor',
                symbol,
                message: msg,
                type: alertType,
                color,
                timestamp: resolveAuditTimestamp(item),
                read: false,
                url: buildAuditUrl(item, alertType),
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
            batch.push({
              id: crypto.randomUUID(),
              dedupKey: buildAuditDedupKey(item, symbol, alertType, msg),
              source: 'useAlertAuditor:new-symbol-backfill',
              symbol,
              message: msg,
              type: alertType,
              color,
              timestamp: resolveAuditTimestamp(item),
              read: false,
              url: buildAuditUrl(item, alertType),
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
