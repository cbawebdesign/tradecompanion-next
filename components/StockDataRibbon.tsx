"use client"

import { useState, useEffect, useRef } from 'react'
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

// Client-side cache shared across all ribbon instances
const cache = new Map<string, StockDataItem>()

function formatMillions(val: number | null | undefined): string {
  if (val == null || val === 0) return '\u2014'
  if (val >= 1000) return (val / 1000).toFixed(1) + 'B'
  if (val >= 1) return val.toFixed(1) + 'M'
  return (val * 1000).toFixed(0) + 'K'
}

function formatVolume(val: number | null | undefined): string {
  if (val == null || val === 0) return '\u2014'
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M'
  if (val >= 1000) return (val / 1000).toFixed(0) + 'K'
  return val.toString()
}

export function StockDataRibbon({ symbol }: { symbol: string | null }) {
  const hubUrl = useStore((s) => s.config.hubUrl)
  const [data, setData] = useState<StockDataItem | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!symbol) {
      setData(null)
      return
    }

    const upper = symbol.toUpperCase()

    // Check cache first
    if (cache.has(upper)) {
      setData(cache.get(upper)!)
      return
    }

    // Abort previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    fetch(`${hubUrl}/StockData?symbol=${encodeURIComponent(upper)}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) {
          if (r.status === 404) return null
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json()
      })
      .then(json => {
        if (json) cache.set(upper, json)
        setData(json)
        setLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') setLoading(false)
      })

    return () => controller.abort()
  }, [symbol, hubUrl])

  if (!symbol) return null
  if (loading) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 text-xs rounded mb-1" style={{ background: 'var(--bg-glass)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }
  if (!data) return null

  const items = [
    { label: 'Float', value: formatMillions(data.SharesFloat) },
    { label: 'MCap', value: formatMillions(data.MarketCap) },
    { label: 'Shares', value: formatMillions(data.SharesOutstanding) },
    { label: 'Short', value: data.ShortFloat || '\u2014' },
    { label: 'Insider', value: data.InsiderOwnership || '\u2014' },
    { label: 'AvgVol', value: formatVolume(data.AvgVolume) },
  ]

  return (
    <div className="flex items-center gap-1 px-2 py-1 text-sm rounded mb-1 flex-wrap" style={{ background: 'var(--bg-glass)' }}>
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex gap-1">
          {i > 0 && <span style={{ color: 'var(--border-glass)' }}>|</span>}
          <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
          <span className="font-medium" style={{ color: '#00e676' }}>{item.value}</span>
        </span>
      ))}
    </div>
  )
}
