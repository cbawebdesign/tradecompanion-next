"use client"

import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import { parseSymbolList } from '@/lib/symbolBlocklist'

interface StockDataItem {
  Ticker: string
  MarketCap: number | null
  SharesOutstanding: number | null
  SharesFloat: number | null
  InsiderOwnership: string | null
  InstOwnership: string | null
  ShortFloat: string | null
  AvgVolume: number | null
  Price: number | null
  LastUpdated: string | null
}

interface AdminPageProps {
  /**
   * Show the deployment rollback control. Defaults to true so existing callers
   * are unaffected. The Status tab passes false — rollback triggers a real
   * production deploy revert, and that should not sit one click away in a tab
   * bar someone uses during the trading session.
   */
  showRollback?: boolean
}

export function AdminPage({ showRollback = true }: AdminPageProps = {}) {
  const hubUrl = useStore((s) => s.config.hubUrl)

  // Rollback state
  const [rollbackStatus, setRollbackStatus] = useState<'idle' | 'confirming' | 'loading' | 'success' | 'error'>('idle')
  const [rollbackMessage, setRollbackMessage] = useState('')
  const [healthData, setHealthData] = useState<any>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const fetchHealth = useCallback(async () => {
    if (!hubUrl) return
    setHealthLoading(true)
    try {
      const resp = await fetch(proxyUrl(`${hubUrl}/tcadmin/health`))
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setHealthData(await resp.json())
    } catch (err: any) {
      setHealthData({ error: err.message })
    } finally {
      setHealthLoading(false)
    }
  }, [hubUrl])

  const handleRollback = useCallback(async () => {
    if (!hubUrl) return
    setRollbackStatus('loading')
    try {
      const resp = await fetch(proxyUrl(`${hubUrl}/tcadmin/rollback`), { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      setRollbackStatus('success')
      setRollbackMessage(data.message || 'Rollback triggered successfully')
      setTimeout(() => setRollbackStatus('idle'), 10000)
    } catch (err: any) {
      setRollbackStatus('error')
      setRollbackMessage(err.message)
    }
  }, [hubUrl])

  // Float editor state
  const [lookupSymbol, setLookupSymbol] = useState('')
  const [stockData, setStockData] = useState<StockDataItem | null>(null)
  const [editFloat, setEditFloat] = useState('')
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'loading' | 'notfound' | 'error'>('idle')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const handleLookup = useCallback(async () => {
    const sym = lookupSymbol.trim().toUpperCase()
    if (!sym) return

    setLookupStatus('loading')
    setStockData(null)
    try {
      const resp = await fetch(proxyUrl(`${hubUrl}/StockData?symbol=${encodeURIComponent(sym)}`))
      if (resp.status === 404) {
        setLookupStatus('notfound')
        return
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data: StockDataItem = await resp.json()
      setStockData(data)
      setEditFloat(data.SharesFloat != null ? String(data.SharesFloat) : '')
      setLookupStatus('idle')
    } catch (err: any) {
      setLookupStatus('error')
      setSaveMessage(err.message)
    }
  }, [lookupSymbol, hubUrl])

  // ── Banned symbols ──────────────────────────────────────────────────────
  //
  // Justin ("Loose Ends"): "Is there a way for me to maintain a Banned List so
  // that any symbol on my banned list, never goes into TC or the 40% Scan
  // airtable DB? … Ideally in the Admin dashboard … so that I can update it in
  // real time."
  //
  // The list was already stored and already served; what was missing was a way
  // for him to edit it without curl, and enforcement anywhere but the browser.
  // The worker now reads this same list and drops banned symbols before the
  // scanner broadcasts or writes to Airtable, so saving here is the whole job.
  const [banText, setBanText] = useState('')
  const [banLoaded, setBanLoaded] = useState(false)
  const [banUpdatedAt, setBanUpdatedAt] = useState<string | null>(null)
  const [banStatus, setBanStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [banMessage, setBanMessage] = useState('')

  const loadBanList = useCallback(async () => {
    if (!hubUrl) return
    setBanStatus('loading')
    try {
      const resp = await fetch(proxyUrl(`${hubUrl}/tcadmin/symbol-blocklist`), { cache: 'no-store' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      // Newline-separated in the editor: a long list is far easier to scan and
      // to delete a line from than one pipe-joined run-on.
      setBanText(Array.from(parseSymbolList(data.symbols)).join('\n'))
      setBanUpdatedAt(data.updatedAt ?? null)
      setBanLoaded(true)
      setBanStatus('idle')
    } catch (err: any) {
      setBanStatus('error')
      setBanMessage(err.message)
    }
  }, [hubUrl])

  // Load once on mount. Without this the box would open empty, which reads as
  // "nothing is banned" — and saving from that state would wipe the list.
  useEffect(() => { loadBanList() }, [loadBanList])

  const banCount = parseSymbolList(banText).size

  const saveBanList = useCallback(async () => {
    if (!hubUrl) return
    setBanStatus('saving')
    try {
      const resp = await fetch(proxyUrl(`${hubUrl}/tcadmin/symbol-blocklist`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: Array.from(parseSymbolList(banText)).join('|') }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      // Show what the server actually stored, not what was typed — it
      // normalises case, de-duplicates and drops anything over six characters.
      const stored = parseSymbolList(data.symbols)
      setBanText(Array.from(stored).join('\n'))
      setBanUpdatedAt(data.updatedAt ?? null)
      setBanStatus('saved')
      // Name anything the server refused. Without this a fat-fingered entry
      // just vanishes from the box on save and reads as a failure to save.
      const dropped = Array.from(parseSymbolList(banText)).filter((s) => !stored.has(s))
      setBanMessage(
        `${data.count} symbol${data.count === 1 ? '' : 's'} banned` +
        (dropped.length ? ` — ignored ${dropped.join(', ')} (not a ticker)` : '')
      )
      setTimeout(() => setBanStatus('idle'), 3000)
    } catch (err: any) {
      setBanStatus('error')
      setBanMessage(err.message)
    }
  }, [hubUrl, banText])

  const formatNum = (val: number | null | undefined) => {
    if (val == null) return '\u2014'
    if (val >= 1000) return (val / 1000).toFixed(1) + 'B'
    if (val >= 1) return val.toFixed(1) + 'M'
    return (val * 1000).toFixed(0) + 'K'
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Admin</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Float Editor */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Stock Data Editor</h3>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={lookupSymbol}
                onChange={(e) => setLookupSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="Symbol (e.g. AAPL)"
                className="flex-1"
              />
              <button
                onClick={handleLookup}
                disabled={lookupStatus === 'loading'}
                className="btn btn-primary"
              >
                {lookupStatus === 'loading' ? 'Loading...' : 'Lookup'}
              </button>
            </div>

            {lookupStatus === 'notfound' && (
              <p className="text-sm text-yellow-400">No data found for {lookupSymbol}</p>
            )}
            {lookupStatus === 'error' && (
              <p className="text-sm text-red-400">Error: {saveMessage}</p>
            )}

            {stockData && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Ticker: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{stockData.Ticker}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>MCap: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatNum(stockData.MarketCap)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Shares: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatNum(stockData.SharesOutstanding)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Short: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{stockData.ShortFloat || '\u2014'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Insider: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{stockData.InsiderOwnership || '\u2014'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Price: </span>
                    <span style={{ color: 'var(--text-primary)' }}>${stockData.Price?.toFixed(2) || '\u2014'}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
                    Float (in millions)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editFloat}
                      onChange={(e) => setEditFloat(e.target.value)}
                      className="flex-1"
                      placeholder="e.g. 15.2"
                    />
                    <button
                      onClick={async () => {
                        setSaveStatus('saving')
                        try {
                          const resp = await fetch(proxyUrl(`${hubUrl}/StockData/update`), {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              Ticker: stockData.Ticker,
                              SharesFloat: editFloat ? parseFloat(editFloat) : null,
                            }),
                          })
                          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                          setSaveStatus('saved')
                          setSaveMessage('Float updated')
                          setTimeout(() => setSaveStatus('idle'), 2000)
                        } catch (err: any) {
                          setSaveStatus('error')
                          setSaveMessage(err.message)
                        }
                      }}
                      disabled={saveStatus === 'saving'}
                      className="btn btn-primary"
                    >
                      {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  {saveStatus === 'saved' && <p className="text-xs text-green-400 mt-1">{saveMessage}</p>}
                  {saveStatus === 'error' && <p className="text-xs text-red-400 mt-1">{saveMessage}</p>}
                </div>

                {stockData.LastUpdated && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Last updated: {new Date(stockData.LastUpdated).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Banned Symbols */}
        <section className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Banned Symbols</h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {banLoaded ? `${banCount} symbol${banCount === 1 ? '' : 's'}` : 'loading…'}
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            One ticker per line. The 40% Scan drops these before they reach the timeline
            and before the row is written to Airtable, so a banned symbol never lands
            anywhere. Takes effect on the next scan, within about a minute — no restart.
          </p>
          <textarea
            value={banText}
            onChange={(e) => setBanText(e.target.value.toUpperCase())}
            spellCheck={false}
            rows={10}
            placeholder={'AHTPI\nAHTPG'}
            className="w-full font-mono text-sm"
            style={{ resize: 'vertical' }}
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={saveBanList}
              disabled={!banLoaded || banStatus === 'saving' || banStatus === 'loading'}
              className="btn btn-primary"
            >
              {banStatus === 'saving' ? 'Saving...' : 'Save Banned List'}
            </button>
            <button
              onClick={loadBanList}
              disabled={banStatus === 'saving' || banStatus === 'loading'}
              className="btn"
              style={{ color: 'var(--text-muted)' }}
            >
              Reload
            </button>
            {banStatus === 'saved' && <span className="text-xs text-green-400">{banMessage}</span>}
            {banStatus === 'error' && <span className="text-xs text-red-400">Error: {banMessage}</span>}
          </div>
          {banUpdatedAt && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Last saved: {new Date(banUpdatedAt).toLocaleString()}
            </p>
          )}
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            To hide <em>every</em> alert type for these tickers — filings, PRs, news —
            and not just the scanner, turn on &quot;Hide blocked symbols&quot; in Settings.
          </p>
        </section>

        {/* Deployment & Rollback */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Deployment &amp; Rollback</h3>
          <div className="space-y-4">
            {/* Health Check */}
            <div>
              <button
                onClick={fetchHealth}
                disabled={healthLoading}
                className="btn btn-primary text-sm"
              >
                {healthLoading ? 'Checking...' : 'Check System Health'}
              </button>
              {healthData && !healthData.error && (
                <div className="mt-3 space-y-1">
                  {healthData.services?.map((svc: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                          backgroundColor: svc.isConnected ? '#4caf50' : '#f44336',
                        }}
                      />
                      <span style={{ color: 'var(--text-primary)' }}>{svc.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>({svc.messageCount} msgs)</span>
                    </div>
                  ))}
                </div>
              )}
              {healthData?.error && (
                <p className="text-xs text-red-400 mt-2">{healthData.error}</p>
              )}
            </div>

            {showRollback && (
              <>
                {/* Divider */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                {/* Rollback Button */}
                <div>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Roll back the Azure Function to the previous deployment. Takes ~2 minutes, zero downtime.
                  </p>
                  {rollbackStatus === 'idle' && (
                    <button
                      onClick={() => setRollbackStatus('confirming')}
                      style={{
                        width: '100%', padding: '12px', backgroundColor: '#d32f2f', color: '#fff',
                        border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 700,
                        cursor: 'pointer', letterSpacing: '0.5px',
                      }}
                    >
                      ROLLBACK TO PREVIOUS VERSION
                    </button>
                  )}
                  {rollbackStatus === 'confirming' && (
                    <div className="space-y-2">
                      <p className="text-sm text-yellow-400 font-semibold">
                        Are you sure? This will redeploy the previous version.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleRollback}
                          style={{
                            flex: 1, padding: '10px', backgroundColor: '#d32f2f', color: '#fff',
                            border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          YES, ROLL BACK NOW
                        </button>
                        <button
                          onClick={() => setRollbackStatus('idle')}
                          style={{
                            flex: 1, padding: '10px', backgroundColor: '#333', color: '#ccc',
                            border: '1px solid #555', borderRadius: '6px', fontSize: '14px', cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {rollbackStatus === 'loading' && (
                    <div className="text-center py-3">
                      <p className="text-sm text-yellow-400">Triggering rollback...</p>
                    </div>
                  )}
                  {rollbackStatus === 'success' && (
                    <div style={{ backgroundColor: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: '8px', padding: '12px' }}>
                      <p className="text-sm text-green-400 font-semibold">{rollbackMessage}</p>
                    </div>
                  )}
                  {rollbackStatus === 'error' && (
                    <div style={{ backgroundColor: 'rgba(244,67,54,0.15)', border: '1px solid rgba(244,67,54,0.3)', borderRadius: '8px', padding: '12px' }}>
                      <p className="text-sm text-red-400">Error: {rollbackMessage}</p>
                      <button
                        onClick={() => setRollbackStatus('idle')}
                        className="text-xs underline mt-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
