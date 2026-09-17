import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { alertTypeColorHex, alertDisplayColor } from '@/lib/alertTypeColor'

/**
 * lib/alertTypeColor.ts is meant to be THE colour spec. It wasn't.
 *
 * alertDisplayColor prefers an alert's own `color` and only falls back to the
 * table, and every ingestion path stamped its own hardcoded hex. So the spec
 * only ever applied to backfilled alerts, and live ones came through in
 * whatever colour that hook happened to use.
 *
 * Justin is colourblind. He asked for press releases to move off purple, it was
 * changed in the table in v2.8.11, and six weeks later he was still seeing
 * purple — because SignalR and the news hub both stamped #7c4dff on arrival.
 * He told us twice and was right both times.
 *
 * These tests make the table authoritative and keep it that way.
 */

const SPEC: Record<string, string> = {
  trade_exchange: '#fdba74',
  catalyst: '#f97316',
  filing: '#60a5fa',
  news: '#2563eb',
  tweet: '#38bdf8',
  tradingview: '#34d399',
  scanner: '#22d3ee',
  price: '#4ade80',
  rss: '#fb7185',
  mail: '#5eead4',
}

// Colours that encode MEANING rather than type, and must survive.
const SEMANTIC = new Set([
  '#ff4466', // FilteredPR negative
  '#00e676', // FilteredPR positive
  '#4caf50', // price alert — upper bound hit
  '#f44336', // price alert — lower bound hit
  '#FF6719', // Airtable YT/SUB, matched deliberately at Justin's request
  '#4FC3F7', // Airtable Articles
])

describe('the colour table', () => {
  it('matches the agreed spec for every type', () => {
    for (const [type, hex] of Object.entries(SPEC)) {
      expect(alertTypeColorHex(type)).toBe(hex)
    }
  })

  it('press releases are dark blue, not purple', () => {
    // The actual request. #7c4dff is the purple that kept reaching him.
    expect(alertTypeColorHex('news')).toBe('#2563eb')
    expect(alertTypeColorHex('news')).not.toBe('#7c4dff')
  })

  it('falls back to the type colour when an alert carries none', () => {
    expect(alertDisplayColor({ type: 'news', color: '' })).toBe('#2563eb')
    expect(alertDisplayColor({ type: 'news', color: null })).toBe('#2563eb')
  })

  it('still honours a per-alert colour when one is set', () => {
    // FilteredPR +/- relies on this.
    expect(alertDisplayColor({ type: 'news', color: '#ff4466' })).toBe('#ff4466')
  })
})

describe('no ingestion path may contradict the spec', () => {
  it('every hardcoded colour is either the spec colour or a known semantic one', () => {
    const roots = ['hooks', 'lib']
    const offenders: string[] = []

    for (const root of roots) {
      for (const file of readdirSync(root)) {
        if (!file.endsWith('.ts')) continue
        const src = readFileSync(join(root, file), 'utf8')
        // Array.from: tsconfig targets es5 without downlevelIteration, so the
        // iterator matchAll returns cannot be for-of'd directly (TS2802).
        for (const m of Array.from(src.matchAll(/color:\s*'(#[0-9a-fA-F]{3,8})'/g))) {
          const hex = m[1]
          const isSpec = Object.values(SPEC).some(v => v.toLowerCase() === hex.toLowerCase())
          const isSemantic = Array.from(SEMANTIC).some(v => v.toLowerCase() === hex.toLowerCase())
          if (!isSpec && !isSemantic) offenders.push(`${root}/${file}: ${hex}`)
        }
      }
    }

    // A failure here means someone hardcoded a colour at ingestion again. Use
    // alertTypeColorHex(type) instead, or add it to SEMANTIC if it genuinely
    // encodes meaning rather than type.
    expect(offenders).toEqual([])
  })
})
