// Alert Logger — records every alert the web app fires so the
// Alert Integrity Agent can compare against backend ground truth.
//
// Logs to:
// 1. localStorage (for local agent to read)
// 2. Azure Function endpoint (for remote agent / dashboard)

import type { Alert } from '@/types'

const STORAGE_KEY_PREFIX = 'tc-alert-log-'
const MAX_LOG_ENTRIES = 2000

interface AlertLogEntry {
  symbol: string
  type: string
  message: string
  timestamp: string
  receivedAt: string
  source: string  // which hook fired it
  url?: string
}

function getTodayKey(): string {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`
}

function getStorageKey(): string {
  return STORAGE_KEY_PREFIX + getTodayKey()
}

function loadLog(): AlertLogEntry[] {
  try {
    const raw = localStorage.getItem(getStorageKey())
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLog(log: AlertLogEntry[]) {
  // Cap size
  const trimmed = log.length > MAX_LOG_ENTRIES ? log.slice(-MAX_LOG_ENTRIES) : log
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(trimmed))
  } catch {
    // localStorage full — clear old days
    cleanOldLogs()
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(trimmed))
    } catch { /* give up */ }
  }
}

function cleanOldLogs() {
  const today = getTodayKey()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(STORAGE_KEY_PREFIX) && !key.endsWith(today)) {
      localStorage.removeItem(key)
    }
  }
}

// Log an alert — called from addAlert() in the store
export function logAlert(alert: Alert, source: string) {
  const entry: AlertLogEntry = {
    symbol: alert.symbol,
    type: alert.type,
    message: (alert.message || '').substring(0, 200),
    timestamp: alert.timestamp instanceof Date ? alert.timestamp.toISOString() : String(alert.timestamp),
    receivedAt: new Date().toISOString(),
    source,
    url: alert.url,
  }

  // Append to localStorage log
  const log = loadLog()
  log.push(entry)
  saveLog(log)

  // Fire-and-forget POST to Azure Function (for remote agent)
  // Only during market hours to avoid noise
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = et.getHours()
  const day = et.getDay()
  if (day >= 1 && day <= 5 && hour >= 4 && hour < 20) {
    try {
      // POST to tcadmin endpoint — fire and forget
      const baseUrl = localStorage.getItem('tc-hub-url') || 'https://tradecompanion3.azurewebsites.net/api'
      fetch(`${baseUrl.replace(/\/api\/?$/, '')}/api/tcadmin/client-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'alert-log', entry }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }
}

// Get the full log for today (used by Alert Integrity Agent)
export function getAlertLog(): AlertLogEntry[] {
  return loadLog()
}

// Export for the agent to read via file system
export function exportLogToFile(): string {
  return JSON.stringify(loadLog(), null, 2)
}
