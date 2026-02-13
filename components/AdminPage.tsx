"use client"

import { useState, useCallback } from 'react'
import { useStore } from '@/store/useStore'

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

export function AdminPage() {
  const hubUrl = useStore((s) => s.config.hubUrl)

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
      const resp = await fetch(`${hubUrl}/StockData?symbol=${encodeURIComponent(sym)}`)
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
                          const resp = await fetch(`${hubUrl}/StockData/update`, {
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

        {/* Placeholder for future admin features */}
        <section className="glass-panel rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Global Settings</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Banned symbols, scanner thresholds, and market cap bucket overrides will go here.
          </p>
        </section>
      </div>
    </div>
  )
}
