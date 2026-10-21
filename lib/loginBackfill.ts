import type { Alert } from '@/types'
import { alertTypeColorHex } from '@/lib/alertTypeColor'

/**
 * The login backfill, extracted from the hook so it can be tested without a
 * browser.
 *
 * It is here rather than inline in useLoginBackfill because the bug that made
 * this feature deliver nothing for a day was entirely in the guard discipline
 * around the fetch, not in the fetch itself — and that discipline is only
 * testable if it is reachable from a test. See runLoginBackfill.
 */

export interface ScanRow {
  symbol: string
  pct: number
  price: number
  session: string
  alertTimeEt: string
  createdUtc: string
}

export interface CatalystRow {
  symbol: string
  title: string
  notes: string
  url: string
  resourceId: string
  modifiedUtc: string
}

export interface BackfillResponse {
  ok?: boolean
  sinceUtc?: string
  scans?: ScanRow[]
  catalysts?: CatalystRow[]
}

/** "Confirmed at $4.22" -> " ($4.22)", matching buildConfirmedAlert's suffix. */
export function priceSuffixFromNotes(notes: string): string {
  const m = /\$\s*([0-9]+(?:\.[0-9]+)?)/.exec(notes || '')
  if (!m) return ''
  const n = Number(m[1])
  return Number.isFinite(n) ? ` ($${n.toFixed(2)})` : ''
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `bf-${Math.random().toString(36).slice(2)}-${Date.now()}`
  }
}

/**
 * Turn the endpoint's rows into timeline alerts.
 *
 * The dedup keys matter more than anything else here: both of these also
 * arrive live, and Justin refreshes mid-session, so a backfilled row has to
 * carry exactly the key its live counterpart would or every entry shows twice.
 */
export function buildBackfillAlerts(json: BackfillResponse): Alert[] {
  const alerts: Alert[] = []

  for (const r of json.scans ?? []) {
    if (!r?.symbol) continue
    // Alert Time ET has no zone suffix, so this parses in the user's local
    // zone — which is ET for this desk, and the same basis the live SignalR
    // handler stamps on. Keeping both on one basis is what makes the keys
    // line up for a symbol that already alerted live this session.
    const when = r.alertTimeEt ? new Date(r.alertTimeEt) : new Date(r.createdUtc)
    if (isNaN(when.getTime())) continue
    alerts.push({
      id: newId(),
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

  for (const r of json.catalysts ?? []) {
    if (!r?.symbol || !r?.title) continue
    const when = new Date(r.modifiedUtc)
    if (isNaN(when.getTime())) continue
    alerts.push({
      id: newId(),
      // Falls back to symbol+title only when the Link carried no id; such a row
      // cannot collide with a live one anyway, since the live confirmer always
      // has a story id.
      dedupKey: r.resourceId ? `cat:rid:${r.resourceId}` : `cat:bf:${r.symbol}-${r.title.slice(0, 40)}`,
      source: 'useLoginBackfill:catalyst',
      symbol: r.symbol,
      message: `${r.title}${priceSuffixFromNotes(r.notes)}`,
      type: 'catalyst',
      color: alertTypeColorHex('catalyst'),
      timestamp: when,
      read: false,
      // Through TC's own PR proxy, like the live confirmer, so it opens in the
      // popup rather than hitting the upstream host.
      url: r.resourceId ? `/api/pr?id=${r.resourceId}` : (r.url || undefined),
    })
  }

  return dedupeWithinBatch(alerts)
}

/**
 * Collapse duplicates WITHIN one backfill batch.
 *
 * addAlerts only dedups incoming alerts against what is already in the store,
 * not against each other, so two rows describing the same story both land.
 * That is not hypothetical: the live bases returned two Catalyst PR rows for
 * the same Supermicro release minutes apart, one of which had no id in its
 * Link and so fell back to a different key. Justin would have seen it twice.
 *
 * Collapsed on symbol+type+message, and where there is a choice the row with
 * a real story id wins — that one carries a working /api/pr URL and the key
 * that matches the live confirmer.
 */
function dedupeWithinBatch(alerts: Alert[]): Alert[] {
  const byContent = new Map<string, Alert>()
  for (const a of alerts) {
    const key = `${a.symbol}|${a.type}|${a.message}`
    const existing = byContent.get(key)
    if (!existing) { byContent.set(key, a); continue }
    const existingHasId = existing.dedupKey?.startsWith('cat:rid:') ?? false
    const candidateHasId = a.dedupKey?.startsWith('cat:rid:') ?? false
    if (candidateHasId && !existingHasId) byContent.set(key, a)
  }
  // Newest first, matching how the timeline sorts.
  return Array.from(byContent.values())
    .sort((x, y) => y.timestamp.getTime() - x.timestamp.getTime())
}

// Module-level because the backfill is once per page load, not once per mount.
const guards = { done: false, inFlight: false }

/** Test-only. Production never resets these — a reload is the reset. */
export function __resetBackfillGuards() {
  guards.done = false
  guards.inFlight = false
}

export type BackfillOutcome = 'applied' | 'skipped-done' | 'skipped-inflight' | 'empty' | 'failed'

/**
 * Fetch the backfill and hand the alerts to the store, at most once per load.
 *
 * THE GUARD DISCIPLINE IS THE POINT. The first version set a single "already
 * ran" flag up front and cancelled itself on effect cleanup, which produced
 * this on every single load:
 *
 *   1. mount with the persisted hubUrl -> flag set -> fetch starts
 *   2. CosmosSync loads the user config -> hubUrl changes -> cleanup -> cancelled
 *   3. effect re-runs, sees the flag set, returns without fetching
 *   4. the original fetch resolves, sees cancelled, throws its alerts away
 *
 * Zero alerts, no error, every time. So:
 *   - `done` is set only AFTER alerts are applied, so a failed or empty
 *     attempt leaves a retry possible when hubUrl settles
 *   - `inFlight` stops a concurrent second fetch, and the caller that loses
 *     that race must NOT cancel the winner
 *   - there is no cancellation at all. Applying late is safe because addAlerts
 *     dedups on dedupKey; discarding the only result is not recoverable.
 */
export async function runLoginBackfill(
  baseApi: string,
  addAlerts: (alerts: Alert[]) => void,
  log: (msg: string) => void = () => {},
): Promise<BackfillOutcome> {
  if (guards.done) return 'skipped-done'
  if (guards.inFlight) return 'skipped-inflight'
  guards.inFlight = true

  try {
    const resp = await fetch(`${baseApi}/Backfill/airtable`)
    if (!resp.ok) return 'failed'
    const json = (await resp.json()) as BackfillResponse
    if (!json?.ok) return 'failed'

    const alerts = buildBackfillAlerts(json)
    log(
      `LoginBackfill: since ${json.sinceUtc} — ${(json.scans ?? []).length} scans, ` +
      `${(json.catalysts ?? []).length} catalysts -> ${alerts.length} alerts`,
    )

    if (alerts.length === 0) {
      // Nothing in the window is a legitimate answer overnight, but it is not
      // "done" — a later run may find rows once the session starts.
      return 'empty'
    }

    addAlerts(alerts)
    guards.done = true
    return 'applied'
  } catch {
    // Never worse than the empty screen this exists to fix.
    return 'failed'
  } finally {
    guards.inFlight = false
  }
}
