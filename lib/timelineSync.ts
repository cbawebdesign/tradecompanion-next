import type { Alert } from '@/types'
import { alertMatchKey, normalizeAlertMessage } from '@/lib/alertDedup'

/**
 * Timeline sync between the open copies of one login — the pure half.
 *
 * Justin, 11/11: "what do you think about doing the same on the alerts
 * timeline? … it would be super clean and smooth if the new session synced up
 * the alerts time line on bootup (instead of a backfill) when there is an
 * existing session open/live."
 *
 * Two things travel between copies:
 *   - a SNAPSHOT, sent by a copy that is already running to one that just
 *     opened (or just woke up), so the newcomer's timeline matches it —
 *     including what was deleted and where Clear All was drawn;
 *   - ACTIONS (delete, hide, clear), sent as they happen, so the copies stay
 *     matched afterwards.
 *
 * Everything that decides what a message does to the timeline lives here so it
 * is testable without a browser or a socket. lib/timelineSyncClient is the
 * wiring.
 */

export const SNAPSHOT_MAX_ALERTS = 500
export const SNAPSHOT_MAX_KEYS = 1000
/** removedAlertKeys is persisted; bounded so it cannot grow for months. */
export const REMOVED_KEYS_CAP = 2000

export interface WireAlert {
  id: string
  symbol: string
  message: string
  type: Alert['type']
  color: string
  timestamp: string
  read: boolean
  url?: string
  dedupKey?: string
  source?: string
}

export type TimelineMessage =
  | { v: 1; kind: 'hello'; from: string }
  | { v: 1; kind: 'snapshot'; from: string; to: string; alerts: WireAlert[]; removedKeys: string[]; clearedSince: number | null }
  | { v: 1; kind: 'remove'; from: string; keys: string[] }
  | { v: 1; kind: 'hide'; from: string; keys: string[] }
  | { v: 1; kind: 'clear'; from: string; at: number }

export interface TimelineState {
  alerts: Alert[]
  hiddenAlertIds: Set<string>
  removedAlertKeys: Set<string>
  clearedSince: number | null
}

export function alertTime(a: { timestamp: Date | string }): number {
  return a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime()
}

/** Newest first; alerts with no usable time go to the bottom. */
export function sortAlertsByTimestampDesc(alerts: Alert[]): Alert[] {
  return alerts.slice().sort((a, b) => {
    const ta = alertTime(a)
    const tb = alertTime(b)
    const aValid = !isNaN(ta)
    const bValid = !isNaN(tb)
    if (!aValid && !bValid) return 0
    if (!aValid) return 1
    if (!bValid) return -1
    return tb - ta
  })
}

/**
 * The keys that identify "this alert" on any copy and from any source.
 *
 * Same two rules addAlert dedups on: a matching dedupKey, or — for everything
 * except TradingView — the same symbol, type and cleaned-up message. TradingView
 * is excluded from the message rule because the same setup legitimately fires
 * again through the day; deleting this morning's must not swallow this
 * afternoon's. Its dedupKey carries the server's own alert id, which every copy
 * and the startup backfill agree on.
 */
export function deletionKeys(a: Pick<Alert, 'symbol' | 'type' | 'message' | 'dedupKey'>): string[] {
  const keys: string[] = []
  if (a.dedupKey) keys.push(`dk:${a.dedupKey}`)
  if (a.type !== 'tradingview') keys.push(alertMatchKey(a.symbol, a.type, a.message))
  return keys
}

export function isDeletedAlert(a: Pick<Alert, 'symbol' | 'type' | 'message' | 'dedupKey'>, removed: Set<string>): boolean {
  if (removed.size === 0) return false
  return deletionKeys(a).some((k) => removed.has(k))
}

/** Add keys, keeping only the newest `cap` (a Set iterates in insertion order). */
export function addRemovedKeys(existing: Set<string>, keys: Iterable<string>, cap = REMOVED_KEYS_CAP): Set<string> {
  const next = new Set(existing)
  for (const k of Array.from(keys)) {
    // Re-insert so a key deleted again counts as recent.
    next.delete(k)
    next.add(k)
  }
  if (next.size <= cap) return next
  return new Set(Array.from(next).slice(next.size - cap))
}

function sameAlert(a: Alert, b: Alert): boolean {
  if (a.dedupKey && b.dedupKey && a.dedupKey === b.dedupKey) return true
  if (a.type === 'tradingview' || b.type === 'tradingview') return false
  return a.symbol === b.symbol && a.type === b.type
    && normalizeAlertMessage(a.message) === normalizeAlertMessage(b.message)
}

function toWire(a: Alert): WireAlert {
  const t = alertTime(a)
  return {
    id: a.id,
    symbol: a.symbol,
    message: a.message,
    type: a.type,
    color: a.color,
    timestamp: isNaN(t) ? '' : new Date(t).toISOString(),
    read: !!a.read,
    ...(a.url ? { url: a.url } : {}),
    ...(a.dedupKey ? { dedupKey: a.dedupKey } : {}),
    ...(a.source ? { source: a.source } : {}),
  }
}

function fromWire(w: WireAlert): Alert | null {
  if (!w || typeof w.id !== 'string' || typeof w.message !== 'string' || typeof w.type !== 'string') return null
  const ts = new Date(w.timestamp)
  if (isNaN(ts.getTime())) return null
  return {
    id: w.id,
    symbol: typeof w.symbol === 'string' ? w.symbol : '',
    message: w.message,
    type: w.type,
    color: w.color,
    timestamp: ts,
    read: !!w.read,
    ...(w.url ? { url: w.url } : {}),
    ...(w.dedupKey ? { dedupKey: w.dedupKey } : {}),
    ...(w.source ? { source: w.source } : {}),
  }
}

/** What a running copy sends a newcomer: what it shows, not what it hides. */
export function buildSnapshot(state: TimelineState, from: string, to: string): TimelineMessage {
  const visible = state.alerts.filter((a) => !state.hiddenAlertIds.has(a.id)).slice(0, SNAPSHOT_MAX_ALERTS)
  const keys = Array.from(state.removedAlertKeys)
  return {
    v: 1,
    kind: 'snapshot',
    from,
    to,
    alerts: visible.map(toWire),
    removedKeys: keys.slice(Math.max(0, keys.length - SNAPSHOT_MAX_KEYS)),
    clearedSince: state.clearedSince,
  }
}

/**
 * Merge a running copy's timeline into this one.
 *
 * A union, never a replacement: whatever this copy already pulled in from its
 * own backfill stays unless the other copy deleted it or cleared past it, and
 * whatever the other copy has that this one lacks is added. That makes the
 * merge safe in any order against the startup backfills, and safe to run more
 * than once.
 */
export function mergeSnapshot(
  state: TimelineState,
  snap: { alerts: WireAlert[]; removedKeys: string[]; clearedSince: number | null },
): TimelineState {
  const removedAlertKeys = addRemovedKeys(state.removedAlertKeys, Array.isArray(snap.removedKeys) ? snap.removedKeys : [])
  const floor = Math.max(state.clearedSince ?? 0, Number(snap.clearedSince) || 0) || null

  // Past the other copy's Clear All: gone, exactly as Clear All does here.
  const afterFloor = (a: Alert) => {
    if (!floor) return true
    const t = alertTime(a)
    return !isNaN(t) && t >= floor
  }

  const merged = state.alerts.filter(afterFloor)
  for (const w of Array.isArray(snap.alerts) ? snap.alerts : []) {
    const a = fromWire(w)
    if (!a || !afterFloor(a)) continue
    if (merged.some((m) => sameAlert(m, a))) continue
    merged.push(a)
  }
  const alerts = sortAlertsByTimestampDesc(merged).slice(0, SNAPSHOT_MAX_ALERTS)

  // Deleted on the other copy: hidden here, but left in place for the symbol's
  // data ribbon — the same thing a delete does on this copy.
  const ids = new Set(alerts.map((a) => a.id))
  const hiddenAlertIds = new Set(Array.from(state.hiddenAlertIds).filter((id) => ids.has(id)))
  for (const a of alerts) {
    if (isDeletedAlert(a, removedAlertKeys)) hiddenAlertIds.add(a.id)
  }

  return { alerts, hiddenAlertIds, removedAlertKeys, clearedSince: floor }
}

/** Another copy deleted an alert: hide it here and keep it from coming back. */
export function applyRemoteRemove(
  state: TimelineState,
  keys: string[],
): Pick<TimelineState, 'hiddenAlertIds' | 'removedAlertKeys'> {
  const removedAlertKeys = addRemovedKeys(state.removedAlertKeys, keys)
  return { hiddenAlertIds: hideMatching(state, keys), removedAlertKeys }
}

/** Another copy hid an alert: hide it here too (hiding is not remembered). */
export function applyRemoteHide(state: TimelineState, keys: string[]): Pick<TimelineState, 'hiddenAlertIds'> {
  return { hiddenAlertIds: hideMatching(state, keys) }
}

function hideMatching(state: TimelineState, keys: string[]): Set<string> {
  const wanted = new Set(keys)
  const hidden = new Set(state.hiddenAlertIds)
  for (const a of state.alerts) {
    if (deletionKeys(a).some((k) => wanted.has(k))) hidden.add(a.id)
  }
  return hidden
}

/**
 * Another copy cleared its timeline at `at`. Same effect as clicking Clear All
 * here, except an alert that arrived after the click (the message takes a
 * second to land) survives.
 */
export function applyRemoteClear(state: TimelineState, at: number): TimelineState {
  const floor = Math.max(state.clearedSince ?? 0, at)
  const alerts = state.alerts.filter((a) => {
    const t = alertTime(a)
    return !isNaN(t) && t >= floor
  })
  const ids = new Set(alerts.map((a) => a.id))
  return {
    alerts,
    hiddenAlertIds: new Set(Array.from(state.hiddenAlertIds).filter((id) => ids.has(id))),
    removedAlertKeys: new Set(),
    clearedSince: floor,
  }
}

/** What another copy's message does to this copy's timeline. */
export function applyRemoteMessage(state: TimelineState, msg: TimelineMessage): Partial<TimelineState> {
  switch (msg.kind) {
    case 'snapshot': return mergeSnapshot(state, msg)
    case 'remove': return applyRemoteRemove(state, msg.keys)
    case 'hide': return applyRemoteHide(state, msg.keys)
    case 'clear': return applyRemoteClear(state, msg.at)
    default: return {}
  }
}

/** Parse what came off the socket; anything unrecognised is ignored. */
export function parseTimelineMessage(raw: unknown): TimelineMessage | null {
  let m: any = raw
  if (typeof raw === 'string') {
    try { m = JSON.parse(raw) } catch { return null }
  }
  if (!m || m.v !== 1 || typeof m.from !== 'string' || !m.from) return null
  switch (m.kind) {
    case 'hello':
      return m
    case 'snapshot':
      return typeof m.to === 'string' && Array.isArray(m.alerts) ? m : null
    case 'remove':
    case 'hide':
      return Array.isArray(m.keys) ? { ...m, keys: m.keys.filter((k: unknown) => typeof k === 'string') } : null
    case 'clear':
      return Number.isFinite(m.at) ? m : null
    default:
      return null
  }
}

// ── Local actions → the wire ────────────────────────────────────────────────
// The store announces a delete/hide/clear the user made here; the client
// forwards it to the other copies. Remote actions are applied through separate
// store actions that never announce, so a message can never bounce back.
export type LocalTimelineAction =
  | { kind: 'remove'; keys: string[] }
  | { kind: 'hide'; keys: string[] }
  | { kind: 'clear'; at: number }

let actionListener: ((a: LocalTimelineAction) => void) | null = null

export function setTimelineActionListener(fn: ((a: LocalTimelineAction) => void) | null) {
  actionListener = fn
}

export function emitTimelineAction(a: LocalTimelineAction) {
  try { actionListener?.(a) } catch { /* never let sync break a click */ }
}
