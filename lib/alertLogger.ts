// Alert Logger — records every alert the web app fires so the
// Alert Integrity Agent can compare against backend ground truth.
//
// Logs to:
// 1. localStorage (for local debugging)
// 2. Azure Function /tcadmin/alert-log endpoint (for cloud-based integrity agent)

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
  const trimmed = log.length > MAX_LOG_ENTRIES ? log.slice(-MAX_LOG_ENTRIES) : log
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(trimmed))
  } catch {
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
  // Prefer the alert's own source field (from hooks) over the generic 'addAlert' caller
  const actualSource = alert.source || source

  const entry: AlertLogEntry = {
    symbol: alert.symbol,
    type: alert.type,
    message: (alert.message || '').substring(0, 200),
    timestamp: alert.timestamp instanceof Date ? alert.timestamp.toISOString() : String(alert.timestamp),
    receivedAt: new Date().toISOString(),
    source: actualSource,
    url: alert.url,
  }

  // Append to localStorage log
  const log = loadLog()
  log.push(entry)
  saveLog(log)

  // Fire-and-forget POST to Azure Function alert-log endpoint (Cosmos DB)
  // Only during market hours to avoid noise
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = et.getHours()
  const day = et.getDay()
  if (day >= 1 && day <= 5 && hour >= 4 && hour < 20) {
    try {
      fetch('https://tradecompanion3.azurewebsites.net/api/tcadmin/alert-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: entry.symbol,
          type: entry.type,
          message: entry.message,
          timestamp: entry.timestamp,
          receivedAt: entry.receivedAt,
          source: 'web',
          hookName: actualSource,
          url: entry.url,
          date: getTodayKey(),
        }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }
}

// Get the full log for today
export function getAlertLog(): AlertLogEntry[] {
  return loadLog()
}
