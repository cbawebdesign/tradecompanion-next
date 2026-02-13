"use client"

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'

interface ServiceStatus {
  name: string
  lastMessage: Date | null
  messageCount: number
  staleness: 'fresh' | 'stale' | 'dead'
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes
const DEAD_THRESHOLD_MS = 15 * 60 * 1000  // 15 minutes

function getStaleness(lastMsg: Date | null): 'fresh' | 'stale' | 'dead' {
  if (!lastMsg) return 'dead'
  const age = Date.now() - new Date(lastMsg).getTime()
  if (age < STALE_THRESHOLD_MS) return 'fresh'
  if (age < DEAD_THRESHOLD_MS) return 'stale'
  return 'dead'
}

function formatAge(lastMsg: Date | null): string {
  if (!lastMsg) return 'never'
  const age = Date.now() - new Date(lastMsg).getTime()
  if (age < 1000) return 'just now'
  if (age < 60000) return `${Math.floor(age / 1000)}s ago`
  if (age < 3600000) return `${Math.floor(age / 60000)}m ago`
  return `${Math.floor(age / 3600000)}h ago`
}

const STATUS_COLORS = {
  fresh: 'text-green-400',
  stale: 'text-yellow-400',
  dead: 'text-red-400',
}

const DOT_COLORS = {
  fresh: 'bg-green-400',
  stale: 'bg-yellow-400',
  dead: 'bg-red-400',
}

export function MonitorPage() {
  const { alerts, scannerAlerts, connectionState, config } = useStore()
  const [now, setNow] = useState(Date.now())
  const timerRef = useRef<NodeJS.Timeout>()

  // Refresh every 5 seconds to update staleness indicators
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Compute last message time by type
  const getLastByType = (type: string): Date | null => {
    const matching = alerts.filter(a => a.type === type)
    if (matching.length === 0) return null
    return matching.reduce((latest, a) => {
      const t = new Date(a.timestamp)
      return t > latest ? t : latest
    }, new Date(0))
  }

  const services: ServiceStatus[] = [
    {
      name: 'SignalR',
      lastMessage: null, // connection-level, shown separately
      messageCount: 0,
      staleness: connectionState === 'connected' ? 'fresh' : connectionState === 'reconnecting' ? 'stale' : 'dead',
    },
    {
      name: 'Filings (SEC)',
      lastMessage: getLastByType('filing'),
      messageCount: alerts.filter(a => a.type === 'filing').length,
      staleness: getStaleness(getLastByType('filing')),
    },
    {
      name: 'Trade Exchange',
      lastMessage: getLastByType('trade_exchange'),
      messageCount: alerts.filter(a => a.type === 'trade_exchange').length,
      staleness: getStaleness(getLastByType('trade_exchange')),
    },
    {
      name: 'Catalyst PRs',
      lastMessage: getLastByType('catalyst'),
      messageCount: alerts.filter(a => a.type === 'catalyst').length,
      staleness: getStaleness(getLastByType('catalyst')),
    },
    {
      name: 'News/PRs',
      lastMessage: getLastByType('news'),
      messageCount: alerts.filter(a => a.type === 'news').length,
      staleness: getStaleness(getLastByType('news')),
    },
    {
      name: 'Scanner',
      lastMessage: scannerAlerts.length > 0 ? new Date(scannerAlerts[0].timestamp) : null,
      messageCount: scannerAlerts.length,
      staleness: getStaleness(scannerAlerts.length > 0 ? new Date(scannerAlerts[0].timestamp) : null),
    },
  ]

  const totalAlerts = alerts.length
  const uptime = connectionState === 'connected'

  return (
    <div className="p-6 h-full overflow-auto">
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Service Monitor</h2>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-panel rounded-lg p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>{totalAlerts}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Alerts</div>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>{scannerAlerts.length}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Scanner Alerts</div>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <div className={`text-2xl font-bold ${uptime ? 'text-green-400' : 'text-red-400'}`}>
            {uptime ? 'UP' : 'DOWN'}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Connection</div>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
            {services.filter(s => s.staleness === 'fresh').length}/{services.length}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Services Healthy</div>
        </div>
      </div>

      {/* Service Status Table */}
      <section className="glass-panel rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Service Health</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Service</th>
              <th className="text-right py-2 px-3">Last Message</th>
              <th className="text-right py-2 px-3">Count</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr key={svc.name} className="border-t" style={{ borderColor: 'var(--border-glass)' }}>
                <td className="py-2 px-3">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT_COLORS[svc.staleness]}`} />
                </td>
                <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{svc.name}</td>
                <td className={`py-2 px-3 text-right font-mono text-xs ${STATUS_COLORS[svc.staleness]}`}>
                  {svc.name === 'SignalR' ? connectionState : formatAge(svc.lastMessage)}
                </td>
                <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                  {svc.messageCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Recent Activity Feed */}
      <section className="glass-panel rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Recent Activity</h3>
        <div className="max-h-80 overflow-auto space-y-1">
          {alerts.slice(0, 50).map((alert) => (
            <div key={alert.id} className="flex items-center gap-2 py-1 text-xs" style={{ borderBottom: '1px solid var(--border-glass)' }}>
              <span className="font-mono w-16 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {new Date(alert.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="w-14 flex-shrink-0 px-1 py-0.5 rounded text-center" style={{
                background: alert.type === 'filing' ? 'rgba(59,130,246,0.2)' :
                  alert.type === 'catalyst' ? 'rgba(249,115,22,0.2)' :
                  alert.type === 'trade_exchange' ? 'rgba(234,179,8,0.2)' :
                  alert.type === 'scanner' ? 'rgba(6,182,212,0.2)' :
                  'rgba(168,85,247,0.2)',
                color: alert.type === 'filing' ? '#60a5fa' :
                  alert.type === 'catalyst' ? '#fb923c' :
                  alert.type === 'trade_exchange' ? '#facc15' :
                  alert.type === 'scanner' ? '#22d3ee' :
                  '#a78bfa',
              }}>
                {alert.type.replace('trade_exchange', 'TX').replace('catalyst', 'CAT').replace('filing', 'SEC')}
              </span>
              <span className="font-mono font-semibold w-12 flex-shrink-0" style={{ color: 'var(--accent-primary)' }}>
                {alert.symbol}
              </span>
              <span className="truncate" style={{ color: 'var(--text-primary)' }}>
                {alert.message.substring(0, 100)}
              </span>
            </div>
          ))}
          {alerts.length === 0 && (
            <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>No alerts yet</p>
          )}
        </div>
      </section>

      {/* Connection Info */}
      <div className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        Hub: {config.hubUrl} | Connection: {connectionState} | Refreshing every 5s
      </div>
    </div>
  )
}
