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

const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes (same as old RSS polling)
const INITIAL_DELAY_MS = 8_000  // wait for other hooks to finish

// Module-level state to survive React remounts
const seenGuids = new Set<string>()
let hasInitiallyFetched = false

// Airtable token — set via NEXT_PUBLIC_AIRTABLE_TOKEN env var or in TC Settings
const FALLBACK_TOKEN = process.env.NEXT_PUBLIC_AIRTABLE_TOKEN || ''

export function useAirtablePolling() {
  const { config, addAlert, addAlerts } = useStore()
  const token = config.apiKey || FALLBACK_TOKEN  // reuse apiKey field or fallback

  useEffect(() => {
    if (!token) return

    let cancelled = false

    async function fetchView(view: typeof VIEWS[0], isInitial: boolean) {
      try {
        // Only fetch records from today (to avoid loading entire history)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const sinceISO = today.toISOString()

        const params = new URLSearchParams({
          view: view.viewId,
          maxRecords: isInitial ? '5' : '20',  // only show last 5 on first load to avoid spam
          'sort[0][field]': 'pubDate',
          'sort[0][direction]': 'desc',
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
  }, [token, addAlert, addAlerts])
}
