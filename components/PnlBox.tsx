"use client"

import { useState, useCallback } from 'react'

// Hardcoded PNL data — will be replaced with live data source later
const ACCOUNT_DATA = {
  account: '1RB17737',
  type: 'Margin',
  realized: 1843.86,
  unrealized: 0.00,
  initEquity: 41576.12,
  bp: 166304.48,
  overnightBp: 83152.00,
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
    const popup = window.open('', 'tc-pnl', `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`)
    if (!popup) return

    popup.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Account PNL</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#ccc;font-family:'Segoe UI',Consolas,monospace;font-size:12px;overflow:hidden;user-select:none;-webkit-app-region:drag}
.hdr{background:#1a1a1a;padding:3px 8px;font-size:11px;color:#888;border-bottom:1px solid #333;display:flex;align-items:center;gap:6px}
.hdr span{color:#aaa;font-weight:600}
table{width:100%;border-collapse:collapse}
th{background:#111;color:#888;font-size:10px;font-weight:600;text-align:left;padding:3px 8px;border-bottom:1px solid #222;text-transform:capitalize;letter-spacing:.3px}
td{padding:3px 8px;font-size:12px;border-bottom:1px solid #1a1a1a}
.grn{color:#00cc44}
.red{color:#ee3333}
.wht{color:#ddd}
</style>
</head>
<body>
<div class="hdr">▸ <span>Account</span></div>
<table>
<tr><th>Account</th><th>Type</th><th>Realized</th><th>Unrealiz...</th><th>InitEquity</th><th>BP</th><th>OverNight BP</th><th>Tickets</th><th>Shares</th></tr>
<tr>
<td class="grn">${d.account}</td>
<td class="grn">${d.type}</td>
<td class="${isPositive ? 'grn' : 'red'}">${formatMoney(d.realized)}</td>
<td class="wht">${formatMoney(d.unrealized)}</td>
<td class="wht">${formatMoney(d.initEquity)}</td>
<td class="wht">${formatMoney(d.bp)}</td>
<td class="wht">${formatMoney(d.overnightBp)}</td>
<td class="wht">${d.tickets}</td>
<td class="wht">${d.shares}</td>
</tr>
</table>
</body>
</html>`)
    popup.document.close()
  }, [])

  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #333',
      borderRadius: '4px',
      overflow: 'hidden',
      fontFamily: "'Segoe UI', Consolas, monospace",
      fontSize: '12px',
      color: '#ccc',
    }}>
      {/* Header */}
      <div
        style={{
          background: '#1a1a1a',
          padding: '3px 8px',
          fontSize: '11px',
          color: '#888',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#666', fontSize: '10px' }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ color: '#aaa', fontWeight: 600 }}>Account</span>
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
                    background: '#111',
                    color: '#888',
                    fontSize: '10px',
                    fontWeight: 600,
                    textAlign: 'left',
                    padding: '3px 8px',
                    borderBottom: '1px solid #222',
                    letterSpacing: '.3px',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '3px 8px', color: '#00cc44', borderBottom: '1px solid #1a1a1a' }}>{d.account}</td>
                <td style={{ padding: '3px 8px', color: '#00cc44', borderBottom: '1px solid #1a1a1a' }}>{d.type}</td>
                <td style={{ padding: '3px 8px', color: isPositive ? '#00cc44' : '#ee3333', borderBottom: '1px solid #1a1a1a' }}>{formatMoney(d.realized)}</td>
                <td style={{ padding: '3px 8px', color: '#ddd', borderBottom: '1px solid #1a1a1a' }}>{formatMoney(d.unrealized)}</td>
                <td style={{ padding: '3px 8px', color: '#ddd', borderBottom: '1px solid #1a1a1a' }}>{formatMoney(d.initEquity)}</td>
                <td style={{ padding: '3px 8px', color: '#ddd', borderBottom: '1px solid #1a1a1a' }}>{formatMoney(d.bp)}</td>
                <td style={{ padding: '3px 8px', color: '#ddd', borderBottom: '1px solid #1a1a1a' }}>{formatMoney(d.overnightBp)}</td>
                <td style={{ padding: '3px 8px', color: '#ddd', borderBottom: '1px solid #1a1a1a' }}>{d.tickets}</td>
                <td style={{ padding: '3px 8px', color: '#ddd', borderBottom: '1px solid #1a1a1a' }}>{d.shares}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
