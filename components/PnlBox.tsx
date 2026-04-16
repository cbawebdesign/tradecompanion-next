"use client"

import { useState, useCallback } from 'react'

// Hardcoded PNL data — will be replaced with live data source later
const ACCOUNT_DATA = {
  account: 'X78659727',
  type: 'Margin',
  realized: -766.00,
  unrealized: 0.00,
  initEquity: 884739.00,
  bp: 884739.00 * 4,
  overnightBp: 884739.00 * 2,
  tickets: 13,
  shares: 20000,
}

function formatMoney(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function PopOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Pop out"
      style={{
        background: 'none',
        border: 'none',
        color: '#888',
        cursor: 'pointer',
        fontSize: '11px',
        padding: '2px 4px',
        lineHeight: 1,
      }}
    >
      ↗
    </button>
  )
}

export function PnlBox() {
  const [collapsed, setCollapsed] = useState(false)
  const d = ACCOUNT_DATA
  const isPositive = d.realized >= 0

  const handlePopOut = useCallback(() => {
    const w = 680
    const h = 120
    const left = window.screenX + (window.innerWidth - w) / 2
    const top = window.screenY + 50
    window.open('/pop/pnl', 'tc-pnl', `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`)
  }, [])

  return (
    <div style={{
      background: '#1c1c1c',
      border: '1px solid #555',
      overflow: 'hidden',
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: '11px',
      color: '#ccc',
    }}>
      {/* Header */}
      <div
        style={{
          background: '#111',
          padding: '1px 6px',
          fontSize: '10px',
          color: '#999',
          borderBottom: '1px solid #444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: '#777', fontSize: '8px' }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ color: '#bbb', fontWeight: 600, fontSize: '10px' }}>Account</span>
        </div>
        <PopOutButton onClick={() => handlePopOut()} />
      </div>

      {/* Table */}
      {!collapsed && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Account', 'Type', 'Realized', 'Unrealiz...', 'InitEquity', 'BP', 'OverNight BP', 'Tickets', 'Shares'].map(h => (
                  <th key={h} style={{
                    background: '#000',
                    color: '#bbb',
                    fontSize: '9px',
                    fontWeight: 600,
                    textAlign: 'left',
                    padding: '2px 6px',
                    borderBottom: '1px solid #3a3a3a',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{d.account}</td>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{d.type}</td>
                <td style={{ padding: '2px 6px', color: isPositive ? '#33ff66' : '#ff4444', fontSize: '13px' }}>{formatMoney(d.realized)}</td>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{formatMoney(d.unrealized)}</td>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{formatMoney(d.initEquity)}</td>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{formatMoney(d.bp)}</td>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{formatMoney(d.overnightBp)}</td>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{d.tickets}</td>
                <td style={{ padding: '2px 6px', color: '#33ff66', fontSize: '13px' }}>{d.shares}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
