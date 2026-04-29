"use client"

// Airtable Direct API — replaces broken miniextensions RSS feeds
// Polls 3 views from Justin's "RSS DB" Airtable base:
//   - TC - YouTube (videos from trading YouTubers)
//   - TC - Substack (substack articles)
//   - TC - Articles (general articles)
//
// Each new record becomes an alert in the alert bar.

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import type { Alert } from '@/types'

const AIRTABLE_BASE_ID = 'appeLF4Ky4hRGHUpH'
const AIRTABLE_TABLE_ID = 'tblJkVNN7iwtlb3WJ'
const AIRTABLE_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`

// Justin's TC views
const VIEWS = [
  { viewId: 'viwvIDrUsiBwiKJ1j', name: 'YouTube', alertSymbol: 'YT', color: '#FF0000', type: 'rss' as const },
  { viewId: 'viw5JrpSlgZx4eoSc', name: 'Substack', alertSymbol: 'SUB', color: '#FF6719', type: 'rss' as const },
  { viewId: 'viwlz9QFqMEtwdrWl', name: 'Articles', alertSymbol: 'NEWS', color: '#4FC3F7', type: 'mail' as const },
]

const POLL_INTERVAL_MS = 60_000   // 60 seconds — Justin wants near-real-time on YT/Substack/News
const INITIAL_DELAY_MS = 8_000    // wait for other hooks to finish

// Module-level state to survive React remounts
const seenGuids = new Set<string>()
let hasInitiallyFetched = false

// Airtable token — baked in at build time via NEXT_PUBLIC_AIRTABLE_TOKEN env var
const AIRTABLE_TOKEN = process.env.NEXT_PUBLIC_AIRTABLE_TOKEN || ''

// 4 PM ET on the previous trading day, expressed as a UTC ISO string.
// Used as the cutoff for Airtable RSS / YT / Substack pulls so backfills
// don't drag in items from previous days.
function previousMarketCloseISO(): string {
  const nowUtc = new Date()
  // Convert to ET to find "today's" calendar day in ET.
  const etNow = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utcEtOffsetMs = nowUtc.getTime() - etNow.getTime()

  // Start with 4:00 PM ET today (in ET wall-clock).
  const cutoffEt = new Date(etNow)
  cutoffEt.setHours(16, 0, 0, 0)

  // If 4 PM ET today is still in the future, the most recent close was yesterday.
  if (cutoffEt > etNow) {
    cutoffEt.setDate(cutoffEt.getDate() - 1)
  }
  // Walk back over weekends — Saturday=6, Sunday=0.
  while (cutoffEt.getDay() === 0 || cutoffEt.getDay() === 6) {
    cutoffEt.setDate(cutoffEt.getDate() - 1)
  }

  // Convert the ET wall-clock back to a real UTC Date by reapplying the offset
  // we measured (handles DST automatically — the offset captures it).
  const cutoffUtc = new Date(cutoffEt.getTime() + utcEtOffsetMs)
  return cutoffUtc.toISOString()
}

export function useAirtablePolling() {
  const { addAlert, addAlerts } = useStore()

  useEffect(() => {
    if (!AIRTABLE_TOKEN) {
      console.log('Airtable: no token set (NEXT_PUBLIC_AIRTABLE_TOKEN)')
      return
    }
    const token = AIRTABLE_TOKEN

    let cancelled = false

    async function fetchView(view: typeof VIEWS[0], isInitial: boolean) {
      try {
        // Cutoff = previous market close (4 PM ET on the previous trading day).
        // Without this Airtable returned the latest N records regardless of
        // age, so on light-volume sources (Substack/YT over a weekend) the
        // backfill spanned multiple days. Justin: "RSS backfilled for multiple
        // days instead of just pulling stuff since the previous close."
        const cutoffISO = previousMarketCloseISO()

        const params = new URLSearchParams({
          view: view.viewId,
          maxRecords: isInitial ? '5' : '20',  // only show last 5 on first load to avoid spam
          'sort[0][field]': 'pubDate',
          'sort[0][direction]': 'desc',
          // Server-side filter — much cheaper than fetching then filtering, and
          // works around the maxRecords cap eating items behind older ones.
          filterByFormula: `IS_AFTER({pubDate}, '${cutoffISO}')`,
        })

        const response = await fetch(`${AIRTABLE_API}?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (!response.ok) {
          if (response.status === 401) console.error('Airtable: invalid token')
          else if (response.status === 429) console.log('Airtable: rate limited, will retry next poll')
          return
        }

        const data = await response.json()
        const records = data.records || []

        const batch: Alert[] = []
        for (const record of records) {
          const f = record.fields
          const guid = f.guid || record.id
          if (seenGuids.has(guid)) continue
          seenGuids.add(guid)

          const title = f.title || ''
          const creator = f.creator || f['dc:creator'] || ''
          const link = f.link || ''
          const pubDate = f.pubDate ? new Date(f.pubDate) : new Date()

          batch.push({
            id: crypto.randomUUID(),
            dedupKey: `at:${guid}`,
            source: 'useAirtablePolling',
            symbol: view.alertSymbol,
            message: creator ? `${creator}: ${title}` : title,
            type: view.type,
            color: view.color,
            timestamp: pubDate,
            read: false,
            url: link || undefined,
          })
        }

        if (batch.length > 0) {
          if (isInitial) addAlerts(batch)
          else batch.forEach(a => addAlert(a))
          console.log(`Airtable ${view.name}: ${batch.length} new`)
        }
      } catch (err) {
        console.error(`Airtable ${view.name} error:`, err)
      }
    }

    async function pollAll() {
      if (cancelled) return
      const isInitial = !hasInitiallyFetched
      if (isInitial) hasInitiallyFetched = true

      for (const view of VIEWS) {
        if (cancelled) break
        await fetchView(view, isInitial)
      }
    }

    // Cap seen guids to prevent memory growth
    if (seenGuids.size > 1000) {
      const arr = Array.from(seenGuids)
      seenGuids.clear()
      arr.slice(-500).forEach(g => seenGuids.add(g))
    }

    const initTimer = setTimeout(pollAll, INITIAL_DELAY_MS)
    const interval = setInterval(pollAll, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      clearInterval(interval)
    }
  }, [addAlert, addAlerts])
}
