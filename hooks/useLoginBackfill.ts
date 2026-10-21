"use client"

import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import { runLoginBackfill } from '@/lib/loginBackfill'

/**
 * Replays the 40% Scan and Catalyst PR bases onto the timeline when TC opens.
 *
 * Justin ("TC Bootup Backfill"): a Windows update rebooted his PC overnight
 * and he came back at 4:30am to an empty timeline — "it really does feel like
 * you lose everything … if all I got this morning on the reboot were these
 * alerts in the timeline, I would have had minimal down time."
 *
 * The webhook backfill already worked; he later asked for SEC filings, tweets
 * and trade exchange to be dropped from startup, leaving webhooks plus these
 * two Airtable bases.
 *
 * All of the substance — the fetch, the alert shapes, the dedup keys and the
 * run-once guards — lives in lib/loginBackfill so it can be tested without a
 * browser. This file is only the wiring, deliberately: the bug that made this
 * deliver nothing for a day was in the guard discipline, and that was
 * unreachable from a test while it sat inside the effect.
 */
export function useLoginBackfill() {
  const hubUrl = useStore((s) => s.config.hubUrl)
  const addAlerts = useStore((s) => s.addAlerts)

  useEffect(() => {
    if (!hubUrl) return
    const baseApi = proxyUrl(hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api')

    // Not awaited, and deliberately NOT cancelled on cleanup. This effect
    // re-runs the moment CosmosSync swaps in the user's config, and throwing
    // away the in-flight result at that point is exactly what emptied the
    // timeline. runLoginBackfill is idempotent and the store dedups.
    void runLoginBackfill(baseApi, addAlerts, (msg) => console.log(msg)).then((outcome) => {
      if (outcome !== 'applied') console.log(`LoginBackfill: ${outcome}`)
    })
  }, [hubUrl, addAlerts])
}
