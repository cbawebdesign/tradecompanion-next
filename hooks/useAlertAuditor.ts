"use client"

// Alert Auditor — Safety net that polls /api/AlertsBySymbol for each watchlisted symbol
// and fires any alert that the real-time hooks missed.
//
// Runs every 60 seconds during market hours.
// This is the "self-healing" layer that ensures Justin never misses an alert.

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import { alertMatchKey } from '@/lib/alertDedup'
import type { Alert } from '@/types'
import { alertTypeColorHex } from '@/lib/alertTypeColor'

// Module-level state to survive React remounts
let lastAuditTime: Date | null = null
// Survives a Strict Mode double-mount but not a reload, which is exactly the
// boundary "startup / refresh" means here.
let hasAudited = false
const seenAlertKeys = new Set<string>()
// Symbols that have had their "first-seen" full-day backfill run this session.
// Prevents re-backfilling the same symbol every time the watchlist reference
// changes (e.g. unrelated mutations). Cleared on page reload.
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
// Shared normalized key so the auditor's existing/seen/fresh dedup matches the
// store's dedup + removeAlert deletions (strips the [Source]/form prefix that the
// live/stored message carries but the REST feed does not).
function alertKey(symbol: string, type: string, message: string): string {
  return alertMatchKey(symbol, type, message)
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
      // ...and alerts the user DELETED this session, so we don't re-inject them
      // (Justin: deleted trade-exchange messages / filings reappearing). Same
      // key format as alertKey(), populated by removeAlert.
      useStore.getState().removedAlertKeys.forEach(k => existingKeys.add(k))

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

      const isFirstAudit = !hasAudited
      hasAudited = true

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
            filings: { items: data.filings || [], alertType: 'filing', color: alertTypeColorHex('filing') },
            tweets: { items: data.tweets || [], alertType: 'tweet', color: alertTypeColorHex('tweet') },
            tradeExchange: { items: data.tradeExchange || [], alertType: 'trade_exchange', color: alertTypeColorHex('trade_exchange') },
            tradingView: { items: data.tradingView || [], alertType: 'tradingview', color: alertTypeColorHex('tradingview') },
            // Catalysts intentionally excluded from auditor backfill. The
            // auditor produces alerts that bypass the confirmation gate (no
            // historical bars to evaluate dolVol+price), which surfaces the
            // raw orange "PR happened" entries Justin doesn't want — only
            // the green confirmed ones should appear as catalysts. Real-time
            // path: newCatalystScanner → confirmer.track → green on confirm.
            // Historical PR record is still visible in the data ribbon.
          }

          // Justin ("Backfill Testing"): on a startup or refresh the timeline
          // gets webhooks, 40% Scan and Catalyst PRs — nothing else. The
          // polling hooks were changed to honour that, but THIS runs after
          // them, sees filings / tweets / trade-exchange missing, concludes
          // they were dropped and puts the whole lot back. From the auditor's
          // point of view absent used to mean lost; for these three it now
          // means deliberate.
          //
          // Only on the FIRST audit after a load. Later passes still recover
          // them, because mid-session those really can go missing on a SignalR
          // drop, and that is the whole reason this hook exists.
          const suppressedOnStartup = new Set(['filings', 'tweets', 'tradeExchange'])

          for (const [_typeName, { items, alertType, color }] of Object.entries(typeMap)) {
            if (isFirstAudit && suppressedOnStartup.has(_typeName)) continue
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

    // The per-symbol startup backfill that used to live here is GONE.
    //
    // backfillNewSymbol() fired for every symbol the session had not yet seen,
    // and `backfilledSymbols` is module-level, so a page load made EVERY
    // watchlist symbol "new" again. Each one fetched AlertsBySymbol back to ET
    // midnight and pushed filings, tweets, trade-exchange and TradingView onto
    // the timeline. The suppressedOnStartup guard added in v2.8.37 only covered
    // the periodic audit()'s typeMap loop, never this function, so Justin kept
    // seeing trade-exchange messages and SEC filings on a fresh restart after
    // we had supposedly removed them. Confirmed from telemetry: 128
    // AlertsBySymbol calls with userFilter=False and since=ET-midnight, from
    // his machine, at the moment of his page load.
    //
    // Removing it is also exactly what he asked for — "when adding a new symbol
    // to either a flagged list or a watch list, please disable any backfill
    // process for the alerts timeline. We no longer need to backfill the alerts
    // timeline when a user is adding symbols... The user can now get all the
    // history in the data ribbon, which is different than when this backfill
    // first went into TC."
    //
    // The periodic audit() below still runs as the safety net for alerts
    // genuinely dropped by a SignalR gap mid-session.

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
    }
  }, [config.hubUrl, addAlert, addAlerts])
}
