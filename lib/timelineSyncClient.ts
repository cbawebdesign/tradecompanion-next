import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import {
  buildSnapshot,
  parseTimelineMessage,
  setTimelineActionListener,
  type LocalTimelineAction,
  type TimelineMessage,
  type TimelineState,
} from '@/lib/timelineSync'

/**
 * Timeline sync — the wiring. See lib/timelineSync for what each message does.
 *
 * The flow:
 *   1. A copy connects (or reconnects after sleep / a wifi drop) and posts a
 *      `hello` to the worker's relay, which forwards it to every open copy of
 *      the same login.
 *   2. Every copy that has been running a while answers with a `snapshot`
 *      addressed to the newcomer: what its timeline shows, what was deleted,
 *      and where Clear All was drawn.
 *   3. The newcomer merges it in. Its own backfills still run — the merge is a
 *      union that respects deletes and the clear line, so the result is the
 *      same whichever lands first, and a copy that opens with nobody else
 *      running still gets the backfill it always did.
 *   4. From then on deletes, hides and Clear All are posted as they happen.
 *
 * Each page load has its own id, separate from the sync deviceId: a pop-out
 * window inherits the main window's sessionStorage, and with a shared id the
 * two would ignore each other's messages as their own.
 */

/** Long enough that a copy which just opened never answers for the timeline. */
export const ESTABLISHED_AFTER_MS = 15_000
/** How long after a hello a snapshot is still taken. */
export const SNAPSHOT_WINDOW_MS = 15_000

export interface TimelineSyncDeps {
  instanceId: string
  now: () => number
  send: (msg: TimelineMessage) => void
  getState: () => TimelineState
  apply: (msg: TimelineMessage) => void
  log?: (msg: string) => void
}

export function createTimelineSyncClient(deps: TimelineSyncDeps) {
  const bootAt = deps.now()
  let adopted = false
  let acceptUntil = 0
  const log = deps.log ?? (() => {})

  const established = () => adopted || deps.now() - bootAt >= ESTABLISHED_AFTER_MS

  return {
    instanceId: deps.instanceId,

    /** Socket is up — first connect or a reconnect. Ask whoever is running. */
    onConnected(reason: string) {
      acceptUntil = deps.now() + SNAPSHOT_WINDOW_MS
      deps.send({ v: 1, kind: 'hello', from: deps.instanceId })
      log(`TimelineSync: hello (${reason})`)
    },

    /** A delete / hide / clear made on this copy. */
    onLocalAction(a: LocalTimelineAction) {
      deps.send({ v: 1, from: deps.instanceId, ...a } as TimelineMessage)
    },

    onMessage(raw: unknown) {
      const msg = parseTimelineMessage(raw)
      if (!msg || msg.from === deps.instanceId) return

      switch (msg.kind) {
        case 'hello':
          if (!established()) return
          deps.send(buildSnapshot(deps.getState(), deps.instanceId, msg.from))
          log('TimelineSync: sent timeline to a copy that just opened')
          return
        case 'snapshot':
          if (msg.to !== deps.instanceId || deps.now() > acceptUntil) return
          deps.apply(msg)
          adopted = true
          log(`TimelineSync: took timeline from a running copy (${msg.alerts.length} alerts)`)
          return
        default:
          deps.apply(msg)
      }
    },
  }
}

// ── The app's one client, bound to the store and the worker relay ───────────

function newInstanceId(): string {
  try { return crypto.randomUUID() } catch { return `tl-${Math.random().toString(36).slice(2)}-${Date.now()}` }
}

function relayUrl(): string | null {
  const cfg = useStore.getState().config
  const login = (cfg.userKey || '').trim().toLowerCase()
  if (!login || !cfg.hubUrl) return null
  const base = cfg.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  return proxyUrl(`${base}/api/timeline/${encodeURIComponent(login)}`)
}

function postToRelay(msg: TimelineMessage) {
  const url = relayUrl()
  if (!url) return
  // text/plain keeps this a simple request — no CORS preflight round trip
  // before every delete. The worker reads the body as a string either way.
  void fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(msg) })
    .catch(() => { /* a missed sync message is caught up by the next hello */ })
}

let client: ReturnType<typeof createTimelineSyncClient> | null = null

function getClient() {
  if (!client) {
    client = createTimelineSyncClient({
      instanceId: newInstanceId(),
      now: () => Date.now(),
      send: postToRelay,
      getState: () => useStore.getState(),
      apply: (msg) => useStore.getState().applyRemoteTimeline(msg),
      log: (m) => console.log(m),
    })
    setTimelineActionListener((a) => client?.onLocalAction(a))
  }
  return client
}

export function timelineSyncConnected(reason: string) {
  getClient().onConnected(reason)
}

export function handleTimelineSyncMessage(raw: unknown) {
  getClient().onMessage(raw)
}
