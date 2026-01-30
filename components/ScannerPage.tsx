"use client"

import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'
import { PopOutButton } from './PopOutButton'
import type { ScannerAlert, ScannerSession, ScannerBucket } from '@/types'

const SESSION_ORDER: ScannerSession[] = ['PRE', 'MKT', 'AH', 'ON']
const BUCKET_ORDER: ScannerBucket[] = ['NANO', 'MICRO', 'SMALL', 'MID', 'LARGE', 'MEGA']

const SESSION_LABELS: Record<ScannerSession, string> = {
  PRE: 'Pre-Market (4:00am - 9:30am)',
  MKT: 'Market (9:30am - 4:00pm)',
  AH: 'Afterhours (4:00pm - 8:00pm)',
  ON: 'Overnight (8:00pm - 4:00am)',
}

const BUCKET_LABELS: Record<ScannerBucket, string> = {
  NANO: 'Nano',
  MICRO: 'Micro',
  SMALL: 'Small',
  MID: 'Mid',
  LARGE: 'Large',
  MEGA: 'Mega',
  UNKNOWN: 'Unknown',
}

function getCurrentSession(): ScannerSession {
  const now = new Date()
  // Get Eastern time (approximate)
  const estOffset = -5 // EST (ignoring DST for simplicity)
  const utcHours = now.getUTCHours()
  const estHours = (utcHours + estOffset + 24) % 24
  const estMinutes = now.getUTCMinutes()
  const timeDecimal = estHours + estMinutes / 60

  if (timeDecimal >= 4 && timeDecimal < 9.5) return 'PRE'
  if (timeDecimal >= 9.5 && timeDecimal < 16) return 'MKT'
  if (timeDecimal >= 16 && timeDecimal < 20) return 'AH'
  return 'ON'
}

interface ScannerPageProps {
  isPopout?: boolean
}

export function ScannerPage({ isPopout = false }: ScannerPageProps) {
  const {
    scannerAlerts,
    clearScannerAlerts,
    flaggedSymbols,
    toggleFlag,
    selectedSymbol,
    setSelectedSymbol,
    activePane,
    setActivePane,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const isActive = activePane === 'scanner'
  const currentSession = getCurrentSession()

  // Initialize collapsed state - non-current sessions collapsed
  const [collapsedSessions, setCollapsedSessions] = useState<Record<ScannerSession, boolean>>(() => {
    const initial: Record<ScannerSession, boolean> = { PRE: true, MKT: true, AH: true, ON: true }
    initial[currentSession] = false
    return initial
  })

  // Handle click to set focus
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        setActivePane('scanner')
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [setActivePane])

  const toggleSession = (session: ScannerSession) => {
    setCollapsedSessions(prev => ({
      ...prev,
      [session]: !prev[session],
    }))
  }

  const expandAll = () => {
    setCollapsedSessions({ PRE: false, MKT: false, AH: false, ON: false })
  }

  const collapseAll = () => {
    setCollapsedSessions({ PRE: true, MKT: true, AH: true, ON: true })
  }

  // Get alerts for a specific session and bucket
  const getAlertsForSessionAndBucket = (session: ScannerSession, bucket: ScannerBucket) => {
    const sessionAlerts = scannerAlerts.filter(a => {
      if (a.session !== session) return false
      const alertBucket = a.bucket || 'UNKNOWN'
      return alertBucket === bucket
    })

    const gainers = sessionAlerts
      .filter(a => a.pctChange > 0)
      .sort((a, b) => b.pctChange - a.pctChange)
      .slice(0, 10)

    const losers = sessionAlerts
      .filter(a => a.pctChange < 0)
      .sort((a, b) => a.pctChange - b.pctChange)
      .slice(0, 10)

    return { gainers, losers }
  }

  const getSessionAlertCount = (session: ScannerSession) => {
    return scannerAlerts.filter(a => a.session === session).length
  }

  const formatPctChange = (pct: number) => {
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%`
  }

  const handleRowClick = (symbol: string) => {
    setSelectedSymbol(symbol)
  }

  const renderAlertRow = (alert: ScannerAlert, index: number) => {
    const isSelected = alert.symbol === selectedSymbol
    const isFlagged = flaggedSymbols.has(alert.symbol)

    return (
      <tr
        key={`${alert.symbol}-${index}`}
        className={clsx(
          'cursor-pointer hover:bg-gray-700/50',
          isSelected && 'bg-blue-900/50'
        )}
        onClick={() => handleRowClick(alert.symbol)}
      >
        <td className="px-1 py-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFlag(alert.symbol)
            }}
            className={clsx(
              'text-sm',
              isFlagged ? 'text-yellow-400' : 'text-gray-600'
            )}
          >
            {isFlagged ? '⚑' : '⚐'}
          </button>
        </td>
        <td className="px-1.5 py-0.5 font-mono font-bold text-sm">
          {alert.symbol}
        </td>
        <td
          className={clsx(
            'px-1.5 py-0.5 text-right font-mono font-bold text-sm',
            alert.pctChange >= 0 ? 'text-green-500' : 'text-red-500'
          )}
        >
          {formatPctChange(alert.pctChange)}
        </td>
        <td className="px-1.5 py-0.5 text-right font-mono text-gray-400 text-sm">
          ${alert.price.toFixed(2)}
        </td>
      </tr>
    )
  }

  const renderBucketColumn = (session: ScannerSession, bucket: ScannerBucket) => {
    const { gainers, losers } = getAlertsForSessionAndBucket(session, bucket)
    const hasData = gainers.length > 0 || losers.length > 0

    return (
      <div
        key={bucket}
        className="flex-1 min-w-[180px] mx-1 bg-gray-900 rounded-md overflow-hidden"
      >
        {/* Bucket header */}
        <div className="px-2 py-1.5 bg-gray-800 border-b border-gray-700 text-center font-bold text-sm">
          {BUCKET_LABELS[bucket]}
        </div>

        {!hasData ? (
          <div className="p-4 text-center text-gray-600 text-xs">
            No alerts
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {/* Gainers */}
            {gainers.length > 0 && (
              <>
                <div className="px-2 py-1 bg-green-900/20 text-green-500 text-xs font-bold">
                  ▲ TOP GAINERS
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {gainers.map((a, i) => renderAlertRow(a, i))}
                  </tbody>
                </table>
              </>
            )}

            {/* Losers */}
            {losers.length > 0 && (
              <>
                <div
                  className={clsx(
                    'px-2 py-1 bg-red-900/20 text-red-500 text-xs font-bold',
                    gainers.length > 0 && 'mt-2'
                  )}
                >
                  ▼ TOP LOSERS
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {losers.map((a, i) => renderAlertRow(a, i))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderSession = (session: ScannerSession) => {
    const isCollapsed = collapsedSessions[session]
    const isCurrent = session === currentSession
    const alertCount = getSessionAlertCount(session)

    return (
      <div
        key={session}
        className={clsx(
          'mb-3 rounded-lg overflow-hidden',
          isCurrent ? 'border-2 border-blue-600' : 'border border-gray-700'
        )}
      >
        {/* Session header */}
        <div
          onClick={() => toggleSession(session)}
          className={clsx(
            'px-4 py-2.5 cursor-pointer flex items-center gap-3 select-none',
            isCurrent ? 'bg-blue-900/30' : 'bg-gray-800'
          )}
        >
          <span className="text-lg">
            {isCollapsed ? '▶' : '▼'}
          </span>
          <span className="font-bold flex-1">
            {SESSION_LABELS[session]}
            {isCurrent && (
              <span className="ml-3 px-2 py-0.5 bg-blue-600 rounded text-xs">
                CURRENT
              </span>
            )}
          </span>
          <span className="text-gray-500 text-sm">
            {alertCount} alerts
          </span>
        </div>

        {/* Session content - buckets */}
        {!isCollapsed && (
          <div className="p-2.5 flex overflow-x-auto bg-gray-900/50">
            {BUCKET_ORDER.map(bucket => renderBucketColumn(session, bucket))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        'flex flex-col h-full border-2 transition-colors',
        isActive ? 'border-blue-500' : 'border-transparent'
      )}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-700 flex items-center gap-3 flex-shrink-0 bg-gray-800">
        <span className="font-bold text-lg">Scanner Leaderboard</span>
        <span className="text-gray-500">
          ({scannerAlerts.length} total alerts)
        </span>

        <div className="ml-auto flex gap-2 items-center">
          <button
            onClick={expandAll}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Collapse All
          </button>
          <button
            onClick={clearScannerAlerts}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm"
          >
            Clear
          </button>
          {!isPopout && (
            <PopOutButton route="/pop/scanner" title="Scanner" width={1200} height={700} />
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="flex-1 overflow-auto p-2.5">
        {scannerAlerts.length === 0 ? (
          <div className="text-center text-gray-600 py-10 text-base">
            Waiting for scanner alerts...
          </div>
        ) : (
          SESSION_ORDER.map(session => renderSession(session))
        )}
      </div>
    </div>
  )
}
