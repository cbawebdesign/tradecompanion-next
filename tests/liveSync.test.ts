import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { useStore, defaultConfig } from '../store/useStore'
import { buildSyncPayload, payloadHash, WEBCONFIG_DENYLIST } from '../lib/syncPayload'
import { applyServerStateToStore } from '../lib/applyServerState'

/** A server doc as the worker would return it for a given payload. */
const asDoc = (p: ReturnType<typeof buildSyncPayload>, revision = 1) => ({ ...p, revision })

const fresh = () => useStore.setState({
  watchlists: [{ id: 'default', name: 'Main', symbols: [] }],
  selectedWatchlistId: 'default',
  flaggedSymbols: new Set(),
  alertSubscriptions: [],
  standaloneAlerts: {},
  hasMigratedSubs: true,
  config: { ...defaultConfig },
} as any)

/** Justin-shaped state: two lists, alert levels, a flag, settings. */
const seed = () => useStore.setState({
  watchlists: [
    { id: 'w-movers', name: 'Movers', symbols: [
      { symbol: 'TOST', upperAlert: 45.5, lowerAlert: 38, notes: '' },
      { symbol: 'NVDA', upperAlert: null, lowerAlert: null, notes: '' },
    ] },
    { id: 'w-ipos', name: 'IPOs', symbols: [{ symbol: 'DAVI', upperAlert: null, lowerAlert: 4.1, notes: '' }] },
  ],
  selectedWatchlistId: 'w-ipos',
  flaggedSymbols: new Set(['AHTPI', 'SEGG']),
  alertSubscriptions: [{ id: 's1', alertType: 'PRs', watchlistId: 'w-movers', audioEnabled: true }],
  standaloneAlerts: { SEGG: { upperAlert: 2.5, lowerAlert: null } },
  hasMigratedSubs: true,
  config: { ...defaultConfig, theme: 'blue', starredThemes: ['Payments'], filteredPrPositive: 'x'.repeat(5000), ahkEnabled: true, ahkUrl: 'http://localhost:9876', watchlistOrder: ['w-movers', 'w-ipos'] },
} as any)

beforeEach(() => fresh())

describe('payload', () => {
  it('carries price alert levels — "It would be awesome if price alerts followed the login"', () => {
    seed()
    const p = buildSyncPayload(useStore.getState())!
    expect(JSON.parse(p.configs.watchlistAlerts)).toEqual({ Movers: { TOST: [45.5, 38] }, IPOs: { DAVI: [null, 4.1] } })
    expect(JSON.parse(p.configs.standaloneAlerts)).toEqual({ SEGG: [2.5, null] })
  })

  it('sends the big filter text once, not twice', () => {
    // filteredPrPositive is 21 KB on justin2 and rode the blob AND its own key.
    seed()
    const p = buildSyncPayload(useStore.getState())!
    expect(p.configs.filteredPrPositive).toHaveLength(5000)
    expect(JSON.parse(p.configs.webConfig).filteredPrPositive).toBeUndefined()
  })

  it("keeps AHK per machine — a laptop without the companion can't switch off the desktop's", () => {
    seed()
    const blob = JSON.parse(buildSyncPayload(useStore.getState())!.configs.webConfig)
    expect(blob.ahkEnabled).toBeUndefined()
    expect(blob.ahkUrl).toBeUndefined()
    expect(WEBCONFIG_DENYLIST.has('ahkEnabled')).toBe(true)
  })

  it('refuses to send a pristine store', () => {
    expect(buildSyncPayload(useStore.getState())).toBeNull()
  })
})

describe('two windows converge — the property that prevents an echo loop', () => {
  it('state → payload → another window gives the SAME fingerprint', () => {
    seed()
    const a = buildSyncPayload(useStore.getState())!
    fresh()
    applyServerStateToStore(asDoc(a))
    const b = buildSyncPayload(useStore.getState())!
    // Different UUIDs on each side; the fingerprint must still agree, or every
    // received update would be saved straight back.
    expect(payloadHash(b)).toBe(payloadHash(a))
  })

  it('applying the same update twice changes nothing', () => {
    seed()
    const doc = asDoc(buildSyncPayload(useStore.getState())!)
    applyServerStateToStore(doc)
    const once = payloadHash(buildSyncPayload(useStore.getState()))
    applyServerStateToStore(doc)
    expect(payloadHash(buildSyncPayload(useStore.getState()))).toBe(once)
  })
})

describe('flagged-list alert types survive the trip', () => {
  it("a user who never touched them keeps every type ON in the other window", () => {
    seed()
    useStore.setState((st: any) => ({ config: { ...st.config, flaggedAlertSubscriptions: undefined } }))
    const before = JSON.parse(buildSyncPayload(useStore.getState())!.configs.subscribedAlerts)
    fresh()
    applyServerStateToStore(asDoc(buildSyncPayload((() => { seed(); useStore.setState((st: any) => ({ config: { ...st.config, flaggedAlertSubscriptions: undefined } })); return useStore.getState() })())!))
    const after = JSON.parse(buildSyncPayload(useStore.getState())!.configs.subscribedAlerts)
    expect(after.AHTPI).toEqual(before.AHTPI)
    expect(after.AHTPI.length).toBeGreaterThan(0)
  })

  it("a doc already saved with '{}' is read as unset, not as all-off", () => {
    seed()
    const p = buildSyncPayload(useStore.getState())!
    fresh()
    applyServerStateToStore({ ...p, configs: { ...p.configs, flaggedAlertSubscriptions: '{}' }, revision: 1 })
    expect(useStore.getState().config.flaggedAlertSubscriptions).toBeUndefined()
  })
})

describe('applying a live update', () => {
  it('keeps watchlist ids and his selected list', () => {
    seed()
    const doc = asDoc(buildSyncPayload(useStore.getState())!)
    applyServerStateToStore(doc)
    const s = useStore.getState()
    expect(s.watchlists.map((w) => w.id)).toEqual(['w-movers', 'w-ipos'])
    // setWatchlists alone would have jumped to the first list on every save.
    expect(s.selectedWatchlistId).toBe('w-ipos')
  })

  it('brings alert levels across from another computer', () => {
    seed()
    const doc = asDoc(buildSyncPayload(useStore.getState())!)
    fresh()
    applyServerStateToStore(doc)
    const tost = useStore.getState().watchlists.find((w) => w.name === 'Movers')!.symbols.find((x) => x.symbol === 'TOST')!
    expect([tost.upperAlert, tost.lowerAlert]).toEqual([45.5, 38])
    expect(useStore.getState().standaloneAlerts).toEqual({ SEGG: { upperAlert: 2.5, lowerAlert: null } })
  })

  it('clears a level that was cleared elsewhere', () => {
    seed()
    useStore.getState().updateSymbolInWatchlist('w-movers', { symbol: 'TOST', upperAlert: null, lowerAlert: null, notes: '' })
    const cleared = asDoc(buildSyncPayload(useStore.getState())!, 2)
    seed()   // this window still shows 45.5 / 38
    applyServerStateToStore(cleared)
    const tost = useStore.getState().watchlists[0].symbols.find((x) => x.symbol === 'TOST')!
    expect([tost.upperAlert, tost.lowerAlert]).toEqual([null, null])
  })

  it('keeps local levels when the doc predates alert sync', () => {
    seed()
    const p = buildSyncPayload(useStore.getState())!
    const { watchlistAlerts: _a, standaloneAlerts: _s, ...old } = p.configs
    applyServerStateToStore({ watchlists: p.watchlists, configs: old, revision: 1 })
    const tost = useStore.getState().watchlists[0].symbols.find((x) => x.symbol === 'TOST')!
    // Old behaviour wiped every level to empty on each restore.
    expect([tost.upperAlert, tost.lowerAlert]).toEqual([45.5, 38])
  })

  it('unflagging the LAST symbol on another computer reaches this one', () => {
    seed()
    const p = buildSyncPayload(useStore.getState())!
    applyServerStateToStore({ ...p, configs: { ...p.configs, flaggedSymbols: '[]' }, revision: 2 })
    // Empty lists used to be ignored, so the last flag could never be removed remotely.
    expect(useStore.getState().flaggedSymbols.size).toBe(0)
  })

  it('a doc with no flags key at all (legacy desktop) leaves local flags alone', () => {
    seed()
    const p = buildSyncPayload(useStore.getState())!
    const { flaggedSymbols: _f, ...rest } = p.configs
    applyServerStateToStore({ ...p, configs: rest, revision: 2 })
    expect(useStore.getState().flaggedSymbols.size).toBe(2)
  })

  it("an older build's blob can't overwrite this machine's AHK setting", () => {
    seed()   // ahkEnabled true here
    const p = buildSyncPayload(useStore.getState())!
    const oldBlob = { ...JSON.parse(p.configs.webConfig), ahkEnabled: false, ahkUrl: 'http://elsewhere' }
    applyServerStateToStore({ ...p, configs: { ...p.configs, webConfig: JSON.stringify(oldBlob) }, revision: 2 })
    expect(useStore.getState().config.ahkEnabled).toBe(true)
    expect(useStore.getState().config.ahkUrl).toBe('http://localhost:9876')
  })

  it('still restores the filter text, from its own key', () => {
    seed()
    const doc = asDoc(buildSyncPayload(useStore.getState())!)
    fresh()
    applyServerStateToStore(doc)
    expect(useStore.getState().config.filteredPrPositive).toHaveLength(5000)
  })
})

describe('the sync loop itself', () => {
  const src = readFileSync(join(__dirname, '..', 'hooks', 'useCosmosSync.ts'), 'utf8')

  it('sends the revision it last saw, and takes the server copy on a 409', () => {
    expect(src).toContain('?baseRevision=${serverRevision.current}')
    expect(src).toMatch(/r\.status === 409[\s\S]{0,200}adoptServer/)
  })

  it('marks a payload synced only AFTER the save succeeds', () => {
    // The old code set the hash before sending, so a failed save never retried.
    const ok = src.indexOf('if (r.ok)')
    const mark = src.indexOf('lastSyncHash.current = hash')
    expect(ok).toBeGreaterThan(0)
    expect(mark).toBeGreaterThan(ok)
  })

  it('a failed load does not unlock saving', () => {
    const at = src.indexOf("console.log('CosmosSync: load failed, retrying'")
    const catchBlock = src.slice(src.lastIndexOf('} catch (err) {', at), at + 120)
    expect(catchBlock).toContain('setTimeout(load, LOAD_RETRY_MS)')
    expect(catchBlock).not.toContain('loadCompleteRef.current = true')
  })

  it('ignores the broadcast of its own save', () => {
    expect(src).toContain('d.origin === deviceId.current')
  })

  it('flushes on close with keepalive, under the size cap', () => {
    expect(src).toContain("window.addEventListener('pagehide', flush)")
    expect(src).toContain('body.length < KEEPALIVE_MAX_BYTES')
  })

  it('saves standalone price alerts too', () => {
    expect(src).toMatch(/\[watchlists, flaggedSymbols, alertSubscriptions, standaloneAlerts, config/)
  })
})
