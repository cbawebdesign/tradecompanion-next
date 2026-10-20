"use client"

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import type { Alert } from '@/types'
import { alertTypeColorHex } from '@/lib/alertTypeColor'

/**
 * Replays the 40% Scan and Catalyst PR bases onto the timeline when TC opens.
 *
 * Justin ("TC Bootup Backfill"): a Windows update rebooted his PC overnight and
 * he came back at 4:30am to an empty timeline — "it really does feel like you
 * lose everything … if all I got this morning on the reboot were these alerts in
 * the timeline, I would have had minimal down time."
 *
 * The webhook and SEC filing backfills already worked; he confirmed those stay.
 * This adds the two Airtable bases, bounded server-side to 16:00 ET on the
 * previous calendar day.
 *
 * DEDUP IS THE WHOLE GAME HERE. Both of these also arrive live, and he refreshes
 * mid-session, so a backfilled row has to carry exactly the key its live
 * counterpart would and let the store collapse the pair:
 *
 *   scans      gain:SYMBOL:<date>   rebuilt from Alert Time ET, matching the
 *                                   SignalR gainScanner handler
 *   catalysts  cat:rid:<storyId>    the only identity Airtable and the live
 *                                   confirmer share — buildConfirmedAlert was
 *                                   moved onto the same key for this
 */

// Survives a React Strict Mode double-mount; a full reload should re-run it,
// which is exactly the case this hook exists for.
let hasBackfilled = false

interface ScanRow {
  symbol: string
  pct: number
  price: number
  session: string
  alertTimeEt: string
  createdUtc: string
}

interface CatalystRow {
  symbol: string
  title: string
  notes: string
  url: string
  resourceId: string
  modifiedUtc: string
}

/** "Confirmed at $4.22" -> " ($4.22)", matching buildConfirmedAlert's suffix. */
function priceSuffixFromNotes(notes: string): string {
  const m = /\$\s*([0-9]+(?:\.[0-9]+)?)/.exec(notes || '')
  if (!m) return ''
  const n = Number(m[1])
  return Number.isFinite(n) ? ` ($${n.toFixed(2)})` : ''
}

export function useLoginBackfill() {
  const hubUrl = useStore((s) => s.config.hubUrl)
  const addAlerts = useStore((s) => s.addAlerts)

  useEffect(() => {
    if (!hubUrl || hasBackfilled) return
    hasBackfilled = true

    const baseApi = hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'
    let cancelled = false

    ;(async () => {
      try {
        const resp = await fetch(proxyUrl(`${baseApi}/Backfill/airtable`))
        if (!resp.ok) return
        const json = await resp.json()
        if (cancelled || !json?.ok) return

        const alerts: Alert[] = []

        for (const r of (json.scans ?? []) as ScanRow[]) {
          if (!r.symbol) continue
          // Alert Time ET has no zone suffix, so this parses in the user's local
          // zone — which is ET for this desk, and is also how the live handler
          // stamps it. Keeping both on the same basis is what makes the keys line
          // up for a symbol that alerted live earlier in the same session.
          const when = r.alertTimeEt ? new Date(r.alertTimeEt) : new Date(r.createdUtc)
          if (isNaN(when.getTime())) continue
          alerts.push({
            id: crypto.randomUUID(),
            dedupKey: `gain:${r.symbol}:${when.toDateString()}`,
            source: 'useLoginBackfill:gainScanner',
            symbol: r.symbol,
            message: `▲ ${Number(r.pct).toFixed(0)}% intraday — $${Number(r.price).toFixed(2)}`,
            type: 'scanner',
            color: alertTypeColorHex('scanner'),
            timestamp: when,
            read: false,
          })
        }

        for (const r of (json.catalysts ?? []) as CatalystRow[]) {
          if (!r.symbol || !r.title) continue
          const when = new Date(r.modifiedUtc)
          if (isNaN(when.getTime())) continue
          alerts.push({
            id: crypto.randomUUID(),
            // Falls back to symbol+title only when the Link carried no id; such a
            // row cannot collide with a live one anyway, since the live path
            // always has a story id.
            dedupKey: r.resourceId ? `cat:rid:${r.resourceId}` : `cat:bf:${r.symbol}-${r.title.slice(0, 40)}`,
            source: 'useLoginBackfill:catalyst',
            symbol: r.symbol,
            message: `${r.title}${priceSuffixFromNotes(r.notes)}`,
            type: 'catalyst',
            color: alertTypeColorHex('catalyst'),
            timestamp: when,
            read: false,
            // Routed through TC's own PR proxy, same as the live confirmer, so it
            // opens in the popup rather than hitting the upstream host directly.
            url: r.resourceId ? `/api/pr?id=${r.resourceId}` : (r.url || undefined),
          })
        }

        if (alerts.length > 0) addAlerts(alerts)
      } catch {
        // A failed backfill just leaves the timeline as it was — never worse than
        // the empty screen this is trying to fix.
      }
    })()

    return () => { cancelled = true }
  }, [hubUrl, addAlerts])
}
