"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'

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
  Country: string | null
  Sector: string | null
  Theme: string | null
  Type: string | null
  Exchange: string | null
  Website: string | null
  NotesUrl: string | null
  Notes: string | null
  Notes2: string | null
  Notes3: string | null
}

const NUMBER_FIELDS = new Set(['SharesFloat', 'MarketCap', 'SharesOutstanding', 'AvgVolume'])
const NOTE_FIELDS = new Set(['Notes', 'Notes2', 'Notes3'])
const sharedCache: Record<string, StockDataItem> = {}

// Returns the app-login username that should be used to read/write per-user notes.
// Must match what legacy desktop sends (legacy reads sessionStorage.tc_user.username).
// Web's LoginGate stores the same login session under sessionStorage.tc_session, so
// we prefer tc_session, fall back to tc_user for cross-compat, then null.
function getNoteUsername(): string | null {
  try {
    const sess = sessionStorage.getItem('tc_session')
    if (sess) {
      const parsed = JSON.parse(sess)
      if (parsed?.username) return parsed.username
    }
    const legacy = sessionStorage.getItem('tc_user')
    if (legacy) {
      const parsed = JSON.parse(legacy)
      if (parsed?.username) return parsed.username
    }
  } catch { /* fall through */ }
  return null
}

/** Background-preload StockData for a list of symbols into the shared cache */
let _preloading = false
export function preloadStockData(symbols: string[], hubUrl: string) {
  if (_preloading) return
  _preloading = true
  const baseApi = hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'
  const uncached = symbols.filter(s => !sharedCache[s.toUpperCase()])
  if (uncached.length === 0) { _preloading = false; return }
  console.log(`StockDataRibbon: preloading ${uncached.length} symbols`)
  const batchSize = 10
  let i = 0
  function nextBatch() {
    const batch = uncached.slice(i, i + batchSize)
    if (batch.length === 0) { _preloading = false; return }
    Promise.all(
      batch.map(sym =>
        fetch(proxyUrl(`${baseApi}/StockData?symbol=${encodeURIComponent(sym.toUpperCase())}`))
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) sharedCache[sym.toUpperCase()] = normalizeStockData(data) })
          .catch(() => {})
      )
    ).then(() => {
      i += batchSize
      setTimeout(nextBatch, 100)
    })
  }
  nextBatch()
}

function formatMillions(val: number | null | undefined): string {
  if (val == null || val === 0) return '\u2014'
  if (val >= 1000) return (val / 1000).toFixed(1) + 'B'
  if (val >= 1) return val.toFixed(1) + 'M'
  return (val * 1000).toFixed(0) + 'K'
}

/** Normalize API response — some fields (Notes, etc.) may come back as per-user objects like {cbaweb: "text"} */
function normalizeStockData(raw: any, user?: string | null): any {
  if (!raw || typeof raw !== 'object') return raw
  const result = { ...raw }
  for (const key of Object.keys(result)) {
    const val = result[key]
    if (val && typeof val === 'object' && !Array.isArray(val) && key !== 'Ticker') {
      // Per-user object — extract this user's value, falling back to first value
      // present (matches legacy behavior so visitors without a login still see notes).
      if (user && val[user] !== undefined) {
        result[key] = val[user]
      } else {
        const values = Object.values(val)
        result[key] = values.length > 0 ? values[0] : null
      }
    }
  }
  return result
}

function emptyData(ticker: string): StockDataItem {
  return {
    Ticker: ticker.toUpperCase(),
    MarketCap: null, SharesOutstanding: null, SharesFloat: null,
    InsiderOwnership: null, InstOwnership: null, ShortFloat: null,
    AvgVolume: null, Price: null, LastUpdated: null,
    Country: null, Sector: null, Theme: null, Type: null, Exchange: null,
    Website: null, NotesUrl: null, Notes: null, Notes2: null, Notes3: null,
  }
}

export function StockDataRibbon({ symbol }: { symbol: string | null }) {
  const hubUrl = useStore((s) => s.config.hubUrl)
  // Notes are bucketed server-side by whatever identifier we pass as `user`.
  // Legacy uses the app-login username (e.g. "cbaweb") from sessionStorage.tc_user.
  // Web was passing config.userKey (TC-XXXXXX) here — that creates a separate
  // notes bucket, breaking sync. Use the same login username legacy uses so the
  // two apps see the same per-symbol notes.
  const noteUser = (typeof window !== 'undefined' ? getNoteUsername() : null)
  const [data, setData] = useState<StockDataItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [fieldDraft, setFieldDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const baseApi = hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'

  useEffect(() => {
    if (!symbol) { setData(null); return }
    const upper = symbol.toUpperCase()

    if (sharedCache[upper]) setData(sharedCache[upper])
    else setLoading(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const userParam = noteUser ? `&user=${encodeURIComponent(noteUser)}` : ''
    fetch(proxyUrl(`${baseApi}/StockData?symbol=${encodeURIComponent(upper)}${userParam}`), { signal: controller.signal })
      .then(r => {
        if (!r.ok) { if (r.status === 404) return null; throw new Error(`HTTP ${r.status}`) }
        return r.json()
      })
      .then(json => {
        const item = json ? normalizeStockData(json, noteUser) : emptyData(upper)
        if (json) sharedCache[upper] = item
        setData(item)
        setLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setData(sharedCache[upper] || emptyData(upper))
          setLoading(false)
        }
      })

    setEditingField(null)
    setSaveStatus(null)
    return () => controller.abort()
  }, [symbol, baseApi, noteUser])

  const startEdit = useCallback((field: string, currentValue: string | number | null) => {
    setEditingField(field)
    setFieldDraft(currentValue != null ? String(currentValue) : '')
  }, [])

  const cancelEdit = useCallback(() => setEditingField(null), [])

  const saveField = useCallback(() => {
    if (!data || !editingField) return

    const value = NUMBER_FIELDS.has(editingField)
      ? (fieldDraft.trim() === '' ? null : parseFloat(fieldDraft))
      : (fieldDraft.trim() === '' ? null : fieldDraft.trim())

    setSaving(true)
    setSaveStatus(null)

    const saveBody: Record<string, any> = { [editingField]: value }
    if (NOTE_FIELDS.has(editingField) && noteUser) {
      saveBody._user = noteUser
    }

    fetch(proxyUrl(`${baseApi}/tcadmin/stockdata/${encodeURIComponent(data.Ticker)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saveBody),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(() => {
        const updated = { ...data, [editingField]: value } as StockDataItem
        sharedCache[data.Ticker.toUpperCase()] = updated
        setData(updated)
        setEditingField(null)
        setSaving(false)
        setSaveStatus('Saved')
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
        saveStatusTimer.current = setTimeout(() => setSaveStatus(null), 2000)
      })
      .catch(() => {
        setSaving(false)
        setSaveStatus('Error saving')
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
        saveStatusTimer.current = setTimeout(() => setSaveStatus(null), 3000)
      })
  }, [data, editingField, fieldDraft, baseApi, noteUser])

  // --- Plain render helpers (NOT components — called as functions to avoid remount) ---

  function renderSep() {
    return <span style={{ color: 'var(--border-glass)' }}>|</span>
  }

  function renderField(label: string, field: string, display: string, raw: string | number | null, valueStyle?: React.CSSProperties) {
    const isEditing = editingField === field
    return (
      <span className="inline-flex gap-0.5 items-center">
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        {isEditing ? (
          <input
            type="text"
            value={fieldDraft}
            onChange={(e) => setFieldDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelEdit() }}
            onBlur={() => { if (!saving) saveField() }}
            autoFocus
            disabled={saving}
            className="bg-black/50 border border-gray-600 rounded-sm text-xs px-1 outline-none"
            style={{ color: '#eee', width: '70px' }}
          />
        ) : (
          <span
            className="font-medium cursor-pointer hover:underline"
            style={valueStyle || { color: '#00e676' }}
            onDoubleClick={() => startEdit(field, raw)}
            title="Double-click to edit"
          >
            {display}
          </span>
        )}
      </span>
    )
  }

  function renderLink(label: string, url: string, title?: string) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium hover:underline"
        style={{ color: '#64b5f6', padding: '0 1px', textDecoration: 'none' }}
        title={title || label}
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </a>
    )
  }

  function renderUrlField(label: string, field: string, value: string | null) {
    if (editingField === field) {
      return (
        <input
          type="text"
          value={fieldDraft}
          onChange={(e) => setFieldDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelEdit() }}
          onBlur={() => { if (!saving) saveField() }}
          autoFocus
          disabled={saving}
          placeholder="Paste URL..."
          className="bg-black/50 border border-gray-600 rounded-sm text-xs px-1 outline-none"
          style={{ color: '#eee', width: '140px' }}
        />
      )
    }
    if (value) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
          style={{ color: '#64b5f6', padding: '0 1px', textDecoration: 'none' }}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(field, value) }}
          title={value}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      )
    }
    return (
      <span
        className="cursor-pointer font-medium hover:underline"
        style={{ color: '#ccc', padding: '0 1px' }}
        onDoubleClick={() => startEdit(field, null)}
        title={`Double-click to add ${label.toLowerCase()}`}
      >
        {label}
      </span>
    )
  }

  function renderNotesRow(label: string, field: string, value: string | null, isLast: boolean) {
    const isEditing = editingField === field
    return (
      <div
        className="flex items-center gap-1.5 px-1.5 py-1"
        style={{
          background: 'var(--bg-glass)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderRadius: isLast ? '0 0 3px 3px' : '0',
          marginBottom: isLast ? '4px' : '0',
        }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider min-w-[65px]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        {isEditing ? (
          <>
            <input
              type="text"
              value={fieldDraft}
              onChange={(e) => setFieldDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelEdit() }}
              onBlur={() => { if (!saving) saveField() }}
              autoFocus
              disabled={saving}
              placeholder={`${label}... (Enter to save, Esc to cancel)`}
              className="flex-1 bg-black/50 border border-gray-600 rounded-sm text-xs px-1.5 py-0.5 outline-none"
              style={{ color: '#eee' }}
            />
            {saving && <span className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>Saving...</span>}
          </>
        ) : (
          <span
            className={`flex-1 text-xs cursor-pointer min-h-[18px] ${value ? '' : 'italic'}`}
            style={{ color: value ? '#ccc' : '#555', wordBreak: 'break-word' }}
            onDoubleClick={() => startEdit(field, value)}
            title="Double-click to edit"
          >
            {value || '\u00A0'}
          </span>
        )}
      </div>
    )
  }

  // --- Render ---

  if (!symbol) return null
  if (loading && !data) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-1 text-xs rounded-t" style={{ background: 'var(--bg-glass)' }}>
        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading...</span>
      </div>
    )
  }
  if (!data) return null

  const isChina = data.Country?.toLowerCase() === 'china'
  const t = data.Ticker

  return (
    <div>
      {/* Data ribbon */}
      <div
        className="flex items-center gap-1 px-1.5 py-1 text-xs rounded-t flex-wrap"
        style={{ background: 'var(--bg-glass)' }}
      >
        {renderField('Float', 'SharesFloat', formatMillions(data.SharesFloat), data.SharesFloat)}
        {renderSep()}
        <span className="inline-flex gap-0.5 items-center">
          <span style={{ color: 'var(--text-muted)' }}>MVPHS</span>
          <span className="font-medium" style={{ color: '#00e676' }}>{'\u2014'}</span>
        </span>
        {renderSep()}
        {renderField('O/S', 'SharesOutstanding', formatMillions(data.SharesOutstanding), data.SharesOutstanding)}
        {renderSep()}
        <span className="inline-flex gap-0.5 items-center">
          <span style={{ color: 'var(--text-muted)' }}>MCap</span>
          <span className="font-medium" style={{ color: '#00e676' }}>{formatMillions(data.MarketCap)}</span>
        </span>
        {renderSep()}
        <span className="inline-flex gap-0.5 items-center">
          <span style={{ color: 'var(--text-muted)' }}>FVOL</span>
          <span className="font-medium" style={{ color: '#00e676' }}>{'\u2014'}</span>
        </span>
        {renderSep()}
        {renderField('Country', 'Country', data.Country || '\u2014', data.Country,
          isChina ? { color: '#f85149', fontWeight: 700 } : undefined)}
        {renderSep()}
        {renderField('Sector', 'Sector', data.Sector || '\u2014', data.Sector)}
        {renderSep()}
        {renderField('Theme', 'Theme', data.Theme || '\u2014', data.Theme)}
        {renderSep()}
        {renderField('Type', 'Type', data.Type || '\u2014', data.Type)}
        {renderSep()}
        {renderField('Exchange', 'Exchange', data.Exchange || '\u2014', data.Exchange)}
        {renderSep()}
        {renderLink('Dilution', `https://dilutiontracker.com/app/search/${encodeURIComponent(t)}?a=6lpa88`)}
        {renderSep()}
        {renderLink('Finviz', `https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}`)}
        {renderSep()}
        {renderLink('X', `https://twitter.com/search?q=%24${encodeURIComponent(t)}&src=typd&f=tweets`, 'X / Twitter')}
        {renderSep()}
        {renderLink('Options', `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/options?p=${encodeURIComponent(t)}`, 'Options Chain')}
        {renderSep()}
        {renderLink('Dividends', `https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(t.toLowerCase())}/dividend-history`)}
        {renderSep()}
        {renderLink('Filings', `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${encodeURIComponent(t)}&owner=include&action=getcompany&Find=Search`, 'SEC Filings')}
        {renderSep()}
        {renderUrlField('Website', 'Website', data.Website)}
        {renderSep()}
        {renderUrlField('Notes URL', 'NotesUrl', data.NotesUrl)}
        {saveStatus && (
          <>
            {renderSep()}
            <span className="text-[10px]" style={{ color: saveStatus === 'Saved' ? '#00e676' : '#f85149' }}>{saveStatus}</span>
          </>
        )}
      </div>

      {/* Notes rows */}
      {renderNotesRow('General', 'Notes', data.Notes, false)}
      {renderNotesRow('Dilution', 'Notes2', data.Notes2, false)}
      {renderNotesRow('Trade Plan', 'Notes3', data.Notes3, true)}
    </div>
  )
}
