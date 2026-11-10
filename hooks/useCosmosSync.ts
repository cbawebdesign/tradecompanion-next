"use client"

// Live sync of one login's watchlists, flags, price alerts and settings across
// every open copy of TC, through /api/user/{userKey}.
//
// Justin, 11/4: worked on his laptop for three hours, then went back to the
// desktop that had been open the whole time and refreshed it. Four seconds
// later the desktop saved its old copy over everything, and the laptop's work
// was gone. The load let local watchlists win over the server's, and the next
// save was last-write-wins on the whole document — so the computer that was
// BEHIND won.
//
// Justin, 11/9: "if there was an easy way to allow changes to flagged lists and
// watch lists to sync in close to real time, theoretically a user could have 2
// or 3 logins open at once and everything would align ... It would just need to
// follow the user ID."
//
// So, per open window:
//
//   LOAD    The server's copy wins. The one exception is edits this browser
//           made that never reached the server while nobody else has saved
//           since (tracked in localStorage as "the revision and fingerprint I
//           last agreed with the server") — those are sent instead. A failed
//           load does NOT unlock saving; it retries. Unlocking on failure is
//           how a stale copy gets to overwrite.
//
//   SAVE    ~1s after the last change, with ?baseRevision=N. If anyone saved
//           since N, the server refuses (409) and sends its copy, which this
//           window takes. A computer that is behind can no longer win.
//
//   LIVE    Every save makes the server tell the login's OTHER open windows
//           (SignalR "userStateChanged", via useSignalR). They pull the new
//           copy within about a second.
//
//   CATCH-UP  A window that missed that message — asleep, offline, mid
//           reconnect — checks on reconnect, on focus, and once a minute.
//
//   CLOSE   Pending changes are flushed when the window hides or closes, with
//           fetch keepalive so the request survives the page going away.
//
//   NO ECHO After taking someone else's copy, the "last synced" fingerprint is
//           rebuilt from THIS window's resulting state. So an update received
//           from another window never looks like a local edit and is never
//           saved back — otherwise three open copies would bounce saves off
//           each other forever.

import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import { buildSyncPayload, payloadHash } from '@/lib/syncPayload'
import { applyServerStateToStore } from '@/lib/applyServerState'

// Short, because other windows are waiting on it. Was 3s when the only reader
// was this same browser after a reload.
const DEBOUNCE_MS = 1000
const RETRY_MS = 10_000
const LOAD_RETRY_MS = 15_000
const POLL_MS = 60_000
const CATCHUP_MIN_GAP_MS = 10_000
// fetch keepalive refuses bodies over 64 KB; leave headroom.
const KEEPALIVE_MAX_BYTES = 60 * 1024

/** One id per open window, so a window can ignore the broadcast of its own save. */
function getDeviceId(): string {
  try {
    let id = sessionStorage.getItem('tc_device_id')
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('tc_device_id', id) }
    return id
  } catch {
    return 'no-session-' + Math.random().toString(36).slice(2)
  }
}

// What this browser last agreed with the server, per login. Survives a reload,
// which is what lets a reload tell "I have unsaved edits" from "I am stale".
const META_KEY = 'tc_sync_meta'
type Meta = { revision: number; hash: string }
function readMeta(userKey: string): Meta | null {
  try { return (JSON.parse(localStorage.getItem(META_KEY) || '{}') as Record<string, Meta>)[userKey] ?? null } catch { return null }
}
function writeMeta(userKey: string, meta: Meta) {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || '{}')
    all[userKey] = meta
    localStorage.setItem(META_KEY, JSON.stringify(all))
  } catch { /* storage full or blocked — next load just takes the server's copy */ }
}

/**
 * Before the server's copy replaces a local one that differed, keep the local
 * one. Only reachable on the first load after this release, when a browser has
 * no record of what it last agreed with the server and cannot know which side
 * is newer. Server wins there (the safe direction), and this makes that
 * recoverable by hand. Last three per login.
 */
function backupLocal(userKey: string, payload: unknown) {
  try {
    const key = `tc_sync_backup_${userKey}`
    const list = JSON.parse(localStorage.getItem(key) || '[]') as unknown[]
    list.unshift({ at: new Date().toISOString(), payload })
    localStorage.setItem(key, JSON.stringify(list.slice(0, 3)))
  } catch { /* best effort */ }
}

// Module-level handles so other code can reach the live instance without
// threading props: Settings forces a flush; useSignalR forwards broadcasts
// and reconnects.
let _syncNowHandle: (() => Promise<void>) | null = null
export function forceCosmosSyncNow(): Promise<void> {
  return _syncNowHandle ? _syncNowHandle() : Promise.resolve()
}
let _remoteHandle: ((d: { revision?: number; origin?: string }) => void) | null = null
/** Called by useSignalR when the server says another window saved. */
export function notifyRemoteUserState(d: { revision?: number; origin?: string }) {
  _remoteHandle?.(d)
}
let _catchUpHandle: (() => void) | null = null
/** Called by useSignalR after a reconnect: any broadcasts during the gap were missed. */
export function requestUserStateCatchUp() {
  _catchUpHandle?.()
}

export function useCosmosSync() {
  const config = useStore((s) => s.config)
  const watchlists = useStore((s) => s.watchlists)
  const flaggedSymbols = useStore((s) => s.flaggedSymbols)
  const alertSubscriptions = useStore((s) => s.alertSubscriptions)
  const standaloneAlerts = useStore((s) => s.standaloneAlerts)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncHash = useRef<string>('')
  const serverRevision = useRef<number>(0)
  const hasLoadedRef = useRef(false)
  const loadCompleteRef = useRef(false)
  const inFlight = useRef(false)
  const rerun = useRef(false)
  const lastCatchUp = useRef(0)
  // Which userKey the current local state belongs to. If the user switches
  // keys (testing someone else's account), wipe user-scoped state before
  // loading so our own settings don't leak up into their doc.
  const claimedKeyRef = useRef<string | null>(null)
  const deviceId = useRef<string>('')
  if (!deviceId.current && typeof window !== 'undefined') deviceId.current = getDeviceId()

  const baseUrl = config.hubUrl?.replace(/\/api\/?$/, '').replace(/\/$/, '') || ''
  const userKey = config.userKey

  const userUrl = useCallback((query = '') =>
    proxyUrl(`${baseUrl}/api/user/${encodeURIComponent(userKey)}${query}`), [baseUrl, userKey])

  useEffect(() => {
    if (!userKey) return
    if (claimedKeyRef.current !== null && claimedKeyRef.current !== userKey) {
      console.log(`CosmosSync: userKey changed ${claimedKeyRef.current} → ${userKey} — resetting local state`)
      useStore.setState({
        watchlists: [{ id: 'default', name: 'Main', symbols: [] }],
        selectedWatchlistId: 'default',
        flaggedSymbols: new Set(),
        alertSubscriptions: [],
        standaloneAlerts: {},
        config: {
          ...useStore.getState().config,
          excludeFilings: '',
          filteredPrPositive: '',
          filteredPrNegative: '',
          tradingViewId: '',
        },
      })
      hasLoadedRef.current = false
      loadCompleteRef.current = false
      lastSyncHash.current = ''
      serverRevision.current = 0
    }
    claimedKeyRef.current = userKey
  }, [userKey])

  /** Take the server's copy as the truth. */
  const adoptServer = useCallback((doc: any) => {
    applyServerStateToStore(doc)
    serverRevision.current = Number(doc?.revision) || 0
    // Fingerprint of THIS window after taking it — see NO ECHO above.
    lastSyncHash.current = payloadHash(buildSyncPayload(useStore.getState()))
    writeMeta(userKey, { revision: serverRevision.current, hash: lastSyncHash.current })
  }, [userKey])

  const syncToCosmos = useCallback(async (opts?: { keepalive?: boolean }) => {
    if (!userKey || !baseUrl) return
    if (!loadCompleteRef.current) return
    if (inFlight.current) { rerun.current = true; return }

    const payload = buildSyncPayload(useStore.getState())
    if (!payload) {
      console.warn('CosmosSync: refusing to push — local state is pristine/empty (would overwrite server)')
      return
    }
    const hash = payloadHash(payload)
    if (hash === lastSyncHash.current) return

    inFlight.current = true
    let retry = false
    try {
      const body = JSON.stringify(payload)
      const r = await fetch(
        userUrl(`?baseRevision=${serverRevision.current}&deviceId=${encodeURIComponent(deviceId.current)}`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
          // Only while closing, and only when it fits — over the cap the
          // browser rejects the request outright, so a plain fetch is the
          // better bet.
          keepalive: !!opts?.keepalive && body.length < KEEPALIVE_MAX_BYTES,
        },
      )
      if (r.ok) {
        const doc = await r.json().catch(() => null)
        serverRevision.current = Number(doc?.revision) || serverRevision.current + 1
        // Only now. The old code marked the payload synced BEFORE sending, so
        // a save that failed was never retried — it just silently never synced.
        lastSyncHash.current = hash
        writeMeta(userKey, { revision: serverRevision.current, hash })
      } else if (r.status === 409) {
        console.warn('CosmosSync: another window saved first — taking its copy')
        adoptServer(await r.json())
      } else {
        retry = true
      }
    } catch (err) {
      console.log('CosmosSync: save failed, will retry', err)
      retry = true
    } finally {
      inFlight.current = false
      if (retry) {
        if (retryRef.current) clearTimeout(retryRef.current)
        retryRef.current = setTimeout(() => syncToCosmos(), RETRY_MS)
      }
      if (rerun.current) {
        rerun.current = false
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => syncToCosmos(), DEBOUNCE_MS)
      }
    }
  }, [userKey, baseUrl, userUrl, adoptServer])

  // Load.
  useEffect(() => {
    if (!userKey || !baseUrl || hasLoadedRef.current) return
    hasLoadedRef.current = true
    const forKey = userKey

    const load = async () => {
      if (claimedKeyRef.current !== forKey) return
      try {
        const r = await fetch(userUrl())
        if (r.status === 404) {
          // No doc yet: this window's state becomes the first one.
          serverRevision.current = 0
          loadCompleteRef.current = true
          syncToCosmos()
          return
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const doc = await r.json()
        const rev = Number(doc?.revision) || 0
        const meta = readMeta(forKey)
        const localPayload = buildSyncPayload(useStore.getState())
        const localHash = payloadHash(localPayload)

        if (meta && meta.revision === rev && localHash !== '' && localHash !== meta.hash) {
          // Edits made here that never reached the server, and nobody has
          // saved since. Keep them and send them.
          console.log('CosmosSync: local has unsaved changes and the server has not moved — sending them')
          serverRevision.current = rev
          lastSyncHash.current = meta.hash
          loadCompleteRef.current = true
          syncToCosmos()
          return
        }

        adoptServer(doc)
        // First load since live sync: there is no record of what this browser
        // last agreed with the server, so it can't tell which side is newer.
        // The server wins — but if that changed anything, keep what was here.
        // Only worth keeping if it held symbols or flags — a brand-new window's
        // defaults are not anyone's work.
        const worthKeeping = !!localPayload && (
          Object.values(localPayload.watchlists).some((syms) => syms.length > 0)
          || (JSON.parse(localPayload.configs.flaggedSymbols || '[]') as unknown[]).length > 0)
        if (!meta && worthKeeping && lastSyncHash.current !== localHash) {
          backupLocal(forKey, localPayload)
          console.warn('CosmosSync: first live-sync load replaced a local copy that differed — kept a backup in tc_sync_backup_' + forKey)
        }
        loadCompleteRef.current = true
        console.log(`CosmosSync: loaded server copy for ${forKey} (rev ${rev})`)
      } catch (err) {
        // Do NOT unlock saving on a failed load — that is how a stale copy gets
        // to overwrite the server. Try again shortly.
        console.log('CosmosSync: load failed, retrying', err)
        setTimeout(load, LOAD_RETRY_MS)
      }
    }
    load()
  }, [userKey, baseUrl, userUrl, adoptServer, syncToCosmos])

  /** Fetch the server copy and take it if it is newer than what this window holds. */
  const pullIfNewer = useCallback(async () => {
    if (!userKey || !baseUrl || !loadCompleteRef.current) return
    lastCatchUp.current = Date.now()
    try {
      const r = await fetch(userUrl())
      if (!r.ok) return
      const doc = await r.json()
      if ((Number(doc?.revision) || 0) > serverRevision.current) {
        console.log(`CosmosSync: newer copy on server (rev ${doc.revision}, had ${serverRevision.current}) — taking it`)
        adoptServer(doc)
      }
    } catch { /* next trigger will try again */ }
  }, [userKey, baseUrl, userUrl, adoptServer])

  // Live: another window of this login saved.
  useEffect(() => {
    _remoteHandle = (d) => {
      if (d?.origin && d.origin === deviceId.current) return   // our own save
      if (typeof d?.revision === 'number' && d.revision <= serverRevision.current) return
      pullIfNewer()
    }
    _catchUpHandle = () => pullIfNewer()
    return () => { _remoteHandle = null; _catchUpHandle = null }
  }, [pullIfNewer])

  // Catch-up for a window that missed a broadcast: on focus, on becoming
  // visible, and once a minute regardless (a desktop left open on a second
  // monitor is visible but never focused).
  useEffect(() => {
    if (!userKey) return
    const maybe = () => {
      if (Date.now() - lastCatchUp.current >= CATCHUP_MIN_GAP_MS) pullIfNewer()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') maybe() }
    window.addEventListener('focus', maybe)
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(() => pullIfNewer(), POLL_MS)
    return () => {
      window.removeEventListener('focus', maybe)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(poll)
    }
  }, [userKey, pullIfNewer])

  // Debounced save on any synced change. Whole config on purpose — listing
  // individual fields meant new settings silently never synced. standaloneAlerts
  // is here because flagged-only price alerts live outside the watchlists.
  useEffect(() => {
    if (!userKey) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => syncToCosmos(), DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [watchlists, flaggedSymbols, alertSubscriptions, standaloneAlerts, config, syncToCosmos, userKey])

  // Flush on hide/close. Justin: "if you hit the X button to close TC, and when
  // the pop up box is confirmed to close, it auto syncs everything". pagehide
  // fires once the close is confirmed; visibilitychange covers tab switches.
  useEffect(() => {
    if (!userKey) return
    const flush = () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      syncToCosmos({ keepalive: true })
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [userKey, syncToCosmos])

  // Bypass-debounce save for Settings (textarea blur / explicit save).
  const syncNow = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    lastSyncHash.current = ''
    await syncToCosmos()
  }, [syncToCosmos])

  useEffect(() => {
    _syncNowHandle = syncNow
    return () => { if (_syncNowHandle === syncNow) _syncNowHandle = null }
  }, [syncNow])

  return { syncNow }
}
