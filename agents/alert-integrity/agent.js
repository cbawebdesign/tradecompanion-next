#!/usr/bin/env node
/**
 * TC Alert Integrity Agent
 *
 * Runs during market hours. Queries the Azure Function backend for what alerts
 * SHOULD exist, compares against what the web app actually displayed, and
 * produces a diff report.
 *
 * Usage:
 *   node agent.js                          # Run once (e.g., from cron)
 *   node agent.js --watch                  # Continuous mode during market hours
 *   node agent.js --report                 # Generate report from collected data
 *   node agent.js --user-key <key>         # Override user key
 *
 * Requires:
 *   AZURE_API_URL  (default: https://tradecompanion3.azurewebsites.net/api)
 *   USER_KEY       (or --user-key flag)
 */

const fs = require('fs')
const path = require('path')

// ─── Config ───
const args = process.argv.slice(2)
const isWatch = args.includes('--watch')
const isReport = args.includes('--report')
const userKeyArg = args.includes('--user-key') ? args[args.indexOf('--user-key') + 1] : null

const AZURE_API = process.env.AZURE_API_URL || 'https://tradecompanion3.azurewebsites.net/api'
const USER_KEY = userKeyArg || process.env.USER_KEY || ''
const AUDIT_INTERVAL_MS = 60_000  // check every 60s
const DATA_DIR = path.join(__dirname, 'data')
const REPORTS_DIR = path.join(__dirname, 'reports')

// Ensure dirs exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true })

// ─── Market Hours Check ───
function isMarketHours() {
  const now = new Date()
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et = new Date(etStr)
  const day = et.getDay()
  const hour = et.getHours()
  const min = et.getMinutes()
  const timeNum = hour * 100 + min
  return day >= 1 && day <= 5 && timeNum >= 400 && timeNum < 2000
}

function getETString() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
}

function getTodayKey() {
  const et = new Date(getETString())
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`
}

// ─── Data Files ───
function getSessionFile() {
  return path.join(DATA_DIR, `session-${getTodayKey()}.json`)
}

function loadSession() {
  const file = getSessionFile()
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  return {
    date: getTodayKey(),
    startTime: getETString(),
    watchlistSymbols: [],
    audits: [],           // each audit run
    backendAlerts: {},    // symbol -> [{type, message, timestamp, source}]
    webAlerts: {},        // symbol -> [{type, message, timestamp}] (from web alert log)
    findings: {
      matched: [],
      missed: [],
      delayed: [],
      duplicate: [],
      extra: [],
    },
    stats: {
      totalBackendAlerts: 0,
      totalWebAlerts: 0,
      totalMatched: 0,
      totalMissed: 0,
      totalDelayed: 0,
      totalDuplicate: 0,
    },
  }
}

function saveSession(session) {
  fs.writeFileSync(getSessionFile(), JSON.stringify(session, null, 2))
}

// ─── API Calls ───
async function fetchJSON(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response.json()
}

async function getWatchlistSymbols() {
  if (!USER_KEY) {
    console.log('WARN: No USER_KEY set — using hardcoded test symbols')
    return ['AAPL', 'TSLA', 'NVDA', 'SPY']
  }
  try {
    const userData = await fetchJSON(`${AZURE_API}/user/${encodeURIComponent(USER_KEY)}`)
    if (userData.watchlists && Array.isArray(userData.watchlists)) {
      const symbols = new Set()
      userData.watchlists.forEach(wl => {
        if (wl.symbols) wl.symbols.forEach(s => symbols.add(s.symbol?.toUpperCase() || s))
      })
      return Array.from(symbols)
    }
  } catch (err) {
    console.error('Failed to fetch watchlist:', err.message)
  }
  return []
}

async function getBackendAlerts(symbol, since) {
  try {
    const sinceStr = encodeURIComponent(since.toISOString())
    const data = await fetchJSON(`${AZURE_API}/AlertsBySymbol?symbol=${encodeURIComponent(symbol)}&since=${sinceStr}`)

    const alerts = []

    // Normalize the various alert types from AlertsBySymbol response
    if (data.filings) {
      data.filings.forEach(f => alerts.push({
        type: 'filing',
        symbol,
        message: f.title || f.form || 'Filing',
        timestamp: f.time_et || f.date || f.save_time,
        source: 'backend',
        id: f.dcn ? `${f.cik}-${f.dcn}` : `${symbol}-${f.form}-${f.time_et}`,
      }))
    }

    if (data.tweets) {
      data.tweets.forEach(t => alerts.push({
        type: 'tweet',
        symbol,
        message: `@${t.username}: ${(t.text || '').substring(0, 80)}`,
        timestamp: t.created_at,
        source: 'backend',
        id: String(t.id_long || t.id),
      }))
    }

    if (data.tradeExchange) {
      data.tradeExchange.forEach(tx => alerts.push({
        type: 'trade_exchange',
        symbol,
        message: (tx.content || '').substring(0, 80),
        timestamp: tx.save_time_utc,
        source: 'backend',
        id: tx.id,
      }))
    }

    if (data.tradingView) {
      data.tradingView.forEach(tv => alerts.push({
        type: 'tradingview',
        symbol,
        message: (tv.raw_text || '').substring(0, 80),
        timestamp: tv.received_utc,
        source: 'backend',
        id: tv.id,
      }))
    }

    if (data.catalysts) {
      data.catalysts.forEach(c => alerts.push({
        type: 'catalyst',
        symbol,
        message: c.title || 'Catalyst',
        timestamp: c.saveTime_et,
        source: 'backend',
        id: `${symbol}-${c.saveTime_et}`,
      }))
    }

    return alerts
  } catch (err) {
    // 404 or empty = no alerts for this symbol
    return []
  }
}

// ─── Web Alert Log Reader ───
// The web app's useAlertAuditor logs recovered alerts to console.
// For now, we read from a web-alert-log.json file that the web app can POST to.
// Future: Azure Function endpoint /tcadmin/alert-log
function getWebAlertLog() {
  const logFile = path.join(DATA_DIR, `web-alerts-${getTodayKey()}.json`)
  if (fs.existsSync(logFile)) {
    return JSON.parse(fs.readFileSync(logFile, 'utf8'))
  }
  return []
}

// ─── Comparison Engine ───
function compareAlerts(backendAlerts, webAlerts) {
  const findings = { matched: [], missed: [], delayed: [], duplicate: [], extra: [] }

  // Build web alert lookup: key = symbol|type|first40chars
  const webKeys = new Map()
  webAlerts.forEach(wa => {
    const key = `${wa.symbol}|${wa.type}|${(wa.message || '').substring(0, 40).toLowerCase()}`
    if (webKeys.has(key)) {
      // Duplicate detection
      findings.duplicate.push({
        ...wa,
        note: `Fired ${(webKeys.get(key).count || 1) + 1} times`,
      })
      webKeys.get(key).count = (webKeys.get(key).count || 1) + 1
    } else {
      webKeys.set(key, { ...wa, count: 1 })
    }
  })

  // Check each backend alert
  backendAlerts.forEach(ba => {
    const key = `${ba.symbol}|${ba.type}|${(ba.message || '').substring(0, 40).toLowerCase()}`
    const webMatch = webKeys.get(key)

    if (webMatch) {
      // Check latency
      const backendTime = new Date(ba.timestamp).getTime()
      const webTime = new Date(webMatch.timestamp).getTime()
      const delayMs = webTime - backendTime

      if (delayMs > 30_000) {
        findings.delayed.push({
          ...ba,
          webTimestamp: webMatch.timestamp,
          delayMs,
          delayFormatted: `${(delayMs / 1000).toFixed(1)}s`,
        })
      } else {
        findings.matched.push({ ...ba, webTimestamp: webMatch.timestamp })
      }
      webKeys.delete(key)
    } else {
      findings.missed.push(ba)
    }
  })

  // Remaining web alerts not matched = extra (web has it, backend doesn't)
  webKeys.forEach((wa) => {
    if (wa.count === 1) {
      findings.extra.push(wa)
    }
  })

  return findings
}

// ─── Single Audit Run ───
async function runAudit() {
  const session = loadSession()
  const runStart = getETString()
  console.log(`\n[${runStart}] Running audit...`)

  // Get watchlist
  if (session.watchlistSymbols.length === 0) {
    session.watchlistSymbols = await getWatchlistSymbols()
    console.log(`  Watchlist: ${session.watchlistSymbols.length} symbols`)
  }

  if (session.watchlistSymbols.length === 0) {
    console.log('  No symbols to audit. Skipping.')
    return
  }

  // Query backend for each symbol
  const today = new Date(getETString())
  today.setHours(0, 0, 0, 0)

  let totalBackend = 0
  for (const symbol of session.watchlistSymbols) {
    try {
      const alerts = await getBackendAlerts(symbol, today)
      session.backendAlerts[symbol] = alerts
      totalBackend += alerts.length
    } catch (err) {
      console.error(`  Error querying ${symbol}:`, err.message)
    }
  }

  // Get web alert log
  const webAlerts = getWebAlertLog()

  // Flatten backend alerts
  const allBackend = Object.values(session.backendAlerts).flat()

  // Compare
  const findings = compareAlerts(allBackend, webAlerts)

  // Update session
  session.findings = findings
  session.stats = {
    totalBackendAlerts: allBackend.length,
    totalWebAlerts: webAlerts.length,
    totalMatched: findings.matched.length,
    totalMissed: findings.missed.length,
    totalDelayed: findings.delayed.length,
    totalDuplicate: findings.duplicate.length,
    totalExtra: findings.extra.length,
  }

  session.audits.push({
    time: runStart,
    backendCount: allBackend.length,
    webCount: webAlerts.length,
    matched: findings.matched.length,
    missed: findings.missed.length,
    delayed: findings.delayed.length,
    duplicate: findings.duplicate.length,
  })

  saveSession(session)

  // Print summary
  const s = session.stats
  console.log(`  Backend: ${s.totalBackendAlerts} alerts | Web: ${s.totalWebAlerts} alerts`)
  console.log(`  Matched: ${s.totalMatched} | Missed: ${s.totalMissed} | Delayed: ${s.totalDelayed} | Dupes: ${s.totalDuplicate}`)

  if (findings.missed.length > 0) {
    console.log(`\n  MISSED ALERTS:`)
    findings.missed.forEach(m => {
      console.log(`    ${m.symbol} [${m.type}] ${m.message.substring(0, 60)} @ ${m.timestamp}`)
    })
  }

  return session
}

// ─── Report Generator ───
function generateReport(session) {
  if (!session) session = loadSession()
  const s = session.stats
  const score = s.totalBackendAlerts > 0
    ? ((s.totalMatched / s.totalBackendAlerts) * 100).toFixed(1)
    : '100.0'

  const reportFile = path.join(REPORTS_DIR, `report-${session.date}.html`)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TC Alert Integrity Report — ${session.date}</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; background: #0a0e1a; color: #d0d8f0; padding: 2rem; }
  h1 { color: #00ff88; font-size: 1.5rem; }
  h2 { color: #4488ff; font-size: 1rem; margin-top: 2rem; }
  .score { font-size: 3rem; font-weight: 800; text-align: center; padding: 2rem; }
  .score.good { color: #00ff88; }
  .score.warn { color: #ffcc22; }
  .score.bad { color: #ff3366; }
  table { width: 100%; border-collapse: collapse; font-size: .8rem; margin: 1rem 0; }
  th { text-align: left; color: #506088; font-size: .7rem; text-transform: uppercase; padding: .5rem; border-bottom: 1px solid #182050; }
  td { padding: .4rem .5rem; border-bottom: 1px solid #101a34; color: #8090b8; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 1rem 0; }
  .stat { background: #111730; border: 1px solid #182050; border-radius: 8px; padding: 1rem; text-align: center; }
  .stat .num { font-size: 1.5rem; font-weight: 700; }
  .stat .lbl { font-size: .6rem; color: #506088; text-transform: uppercase; letter-spacing: .1em; margin-top: .3rem; }
  .matched .num { color: #00ff88; }
  .missed .num { color: #ff3366; }
  .delayed .num { color: #ffcc22; }
  .dupes .num { color: #ff8844; }
  .badge { display: inline-block; font-size: .6rem; padding: 2px 6px; border-radius: 3px; font-weight: 700; }
  .b-miss { background: rgba(255,51,102,.1); color: #ff3366; }
  .b-delay { background: rgba(255,204,34,.1); color: #ffcc22; }
  .b-dupe { background: rgba(255,136,68,.1); color: #ff8844; }
  .b-match { background: rgba(0,255,136,.1); color: #00ff88; }
  .meta { color: #506088; font-size: .7rem; margin-top: 2rem; }
</style>
</head>
<body>
<h1>TC Alert Integrity Report</h1>
<p style="color:#8090b8">${session.date} &mdash; ${session.watchlistSymbols.length} symbols tracked &mdash; ${session.audits.length} audit runs</p>

<div class="score ${parseFloat(score) >= 95 ? 'good' : parseFloat(score) >= 80 ? 'warn' : 'bad'}">
  ${score}% Alert Delivery
</div>

<div class="stat-grid">
  <div class="stat matched"><div class="num">${s.totalMatched}</div><div class="lbl">Matched</div></div>
  <div class="stat missed"><div class="num">${s.totalMissed}</div><div class="lbl">Missed</div></div>
  <div class="stat delayed"><div class="num">${s.totalDelayed}</div><div class="lbl">Delayed (&gt;30s)</div></div>
  <div class="stat dupes"><div class="num">${s.totalDuplicate}</div><div class="lbl">Duplicates</div></div>
</div>

${s.totalMissed > 0 ? `
<h2>Missed Alerts</h2>
<table>
<tr><th>Symbol</th><th>Type</th><th>Message</th><th>Time</th></tr>
${session.findings.missed.map(m => `<tr><td>${m.symbol}</td><td><span class="badge b-miss">${m.type}</span></td><td>${(m.message || '').substring(0, 80)}</td><td>${m.timestamp || ''}</td></tr>`).join('\n')}
</table>
` : '<h2 style="color:#00ff88">No Missed Alerts</h2>'}

${s.totalDelayed > 0 ? `
<h2>Delayed Alerts (&gt;30s)</h2>
<table>
<tr><th>Symbol</th><th>Type</th><th>Message</th><th>Delay</th></tr>
${session.findings.delayed.map(d => `<tr><td>${d.symbol}</td><td><span class="badge b-delay">${d.type}</span></td><td>${(d.message || '').substring(0, 80)}</td><td>${d.delayFormatted}</td></tr>`).join('\n')}
</table>
` : ''}

${s.totalDuplicate > 0 ? `
<h2>Duplicate Alerts</h2>
<table>
<tr><th>Symbol</th><th>Type</th><th>Message</th><th>Count</th></tr>
${session.findings.duplicate.map(d => `<tr><td>${d.symbol}</td><td><span class="badge b-dupe">${d.type}</span></td><td>${(d.message || '').substring(0, 80)}</td><td>${d.note}</td></tr>`).join('\n')}
</table>
` : ''}

<h2>Audit Timeline</h2>
<table>
<tr><th>Time</th><th>Backend</th><th>Web</th><th>Matched</th><th>Missed</th><th>Delayed</th></tr>
${session.audits.map(a => `<tr><td>${a.time}</td><td>${a.backendCount}</td><td>${a.webCount}</td><td>${a.matched}</td><td>${a.missed}</td><td>${a.delayed}</td></tr>`).join('\n')}
</table>

<h2>Symbols Tracked</h2>
<p style="color:#8090b8;font-size:.8rem">${session.watchlistSymbols.join(', ')}</p>

<div class="meta">
  Generated by TC Alert Integrity Agent &mdash; ${getETString()}
</div>
</body>
</html>`

  fs.writeFileSync(reportFile, html)
  console.log(`\nReport saved: ${reportFile}`)
  return reportFile
}

// ─── Main ───
async function main() {
  console.log('TC Alert Integrity Agent')
  console.log(`API: ${AZURE_API}`)
  console.log(`User Key: ${USER_KEY ? USER_KEY.substring(0, 8) + '...' : '(not set)'}`)
  console.log(`Mode: ${isWatch ? 'WATCH (continuous)' : isReport ? 'REPORT' : 'SINGLE RUN'}`)
  console.log('')

  if (isReport) {
    generateReport()
    return
  }

  // Single run
  const session = await runAudit()

  if (isWatch) {
    // Continuous mode — run every 60s during market hours
    console.log('\nEntering watch mode. Auditing every 60s during market hours...')
    setInterval(async () => {
      if (isMarketHours()) {
        await runAudit()
      } else {
        // After market: generate final report and exit
        const session = loadSession()
        if (session.audits.length > 0) {
          console.log('\nMarket closed. Generating final report...')
          generateReport(session)
          process.exit(0)
        }
      }
    }, AUDIT_INTERVAL_MS)
  } else {
    // Single run — also generate report
    if (session) generateReport(session)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
