"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'

/**
 * Fills in watchlist / flagged-list prices without waiting for a trade to print.
 *
 * Justin (2026-10-20): "when logging in to start the day the quotes for symbols on
 * the flagged list and watch lists take forever to populate … this morning it was
 * about an hour, probably longer until % change columns started populating. I added
 * some symbols to a watch list earlier as well and the % change still won't load."
 *
 * Every price in TC arrives over the Polygon websocket, which only emits when a
 * symbol actually PRINTS. A thin name can go an hour without a trade, so the row
 * showed the seeded previous close with a blank % change — PFAI sat at 5.10 all
 * morning while it had really traded 16k shares and was down 6.9%.
 *
 * usePrevCloses already seeds `last` from the previous close, which is what makes
 * those rows look populated-but-frozen. This asks the server for an actual current
 * price for exactly the symbols on screen. The websocket still drives live updates;
 * this just means the first one is not what you wait on.
 *
 * Runs on mount, whenever the symbol set changes (so a symbol added mid-session
 * fills in at once rather than at the next print), and on a slow interval as a
 * backstop for a name that never trades again all session.
 */
const REFRESH_MS = 60 * 1000

export function useQuoteSnapshot() {
  const hubUrl = useStore((s) => s.config.hubUrl)
  const watchlists = useStore((s) => s.watchlists)
  const flaggedSymbols = useStore((s) => s.flaggedSymbols)
  const updateQuotes = useStore((s) => s.updateQuotes)

  // Symbols currently on screen, as a stable string so the effect only re-runs
  // when the SET changes rather than on every watchlist object identity change.
  const symbols = Array.from(
    new Set([
      ...watchlists.flatMap((w) => w.symbols.map((s) => s.symbol)),
      ...Array.from(flaggedSymbols ?? []),
    ]),
  )
    .filter(Boolean)
    .map((s) => s.toUpperCase())
    .sort()
  const key = symbols.join(',')

  const inFlight = useRef(false)

  useEffect(() => {
    if (!hubUrl || symbols.length === 0) return

    const baseApi = hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'
    let cancelled = false

    const pull = async () => {
      // The server holds a 45s cache, so overlapping calls only duplicate work.
      if (inFlight.current) return
      inFlight.current = true
      try {
        // Chunked, because the whole list does not fit in a URL. Justin's
        // watchlists plus the flagged list run to several hundred symbols, and
        // a single GET carrying all of them exceeds the request-line limit and
        // is rejected outright — which is why the first version of this only
        // appeared to work for names that happened to print on the websocket.
        const CHUNK = 100
        const batches: string[][] = []
        for (let i = 0; i < symbols.length; i += CHUNK) batches.push(symbols.slice(i, i + CHUNK))

        const responses = await Promise.all(
          batches.map((b) =>
            fetch(proxyUrl(`${baseApi}/Quotes?symbols=${encodeURIComponent(b.join(','))}`))
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        )
        if (cancelled) return

        const quotes = responses.flatMap((j) => (Array.isArray(j?.quotes) ? j.quotes : []))
        if (quotes.length === 0) return

        const now = new Date()
        const mapped = quotes
          .filter((q: { last?: number }) => (q.last ?? 0) > 0)
          .map((q: { symbol: string; last: number; changePercent: number; volume: number; prevClose: number }) => ({
            symbol: q.symbol,
            bid: 0,
            ask: 0,
            last: q.last,
            volume: q.volume ?? 0,
            // updateQuotes recomputes these from the prevCloses map when it has
            // one; the server's own figure is the fallback for a symbol missing
            // from that map, which is precisely the case that showed a blank.
            change: q.prevClose > 0 ? q.last - q.prevClose : 0,
            changePercent: q.changePercent ?? 0,
            timestamp: now,
          }))

        if (mapped.length > 0) updateQuotes(mapped)
      } catch {
        // A failed snapshot just means the websocket remains the only source,
        // which is the behaviour this hook was added to improve on — never worse.
      } finally {
        inFlight.current = false
      }
    }

    void pull()
    const t = setInterval(pull, REFRESH_MS)
    return () => { cancelled = true; clearInterval(t) }
    // `key` is the symbol set; `symbols.length` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hubUrl, updateQuotes])
}
