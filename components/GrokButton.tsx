"use client"

import { useState, useCallback } from 'react'
import { GrokSummary } from './GrokSummary'

const GROK_API_URL = 'https://tradecompanion-grok.azurewebsites.net/api/groksummary-func'

interface GrokButtonProps {
  url: string
  symbol: string
  alertType: string
  alertText: string
  displayMode?: 'modal' | 'slideout' | 'inline'
}

export function GrokButton({
  url,
  symbol,
  alertType,
  alertText,
  displayMode = 'modal',
}: GrokButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchGrokSummary = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setShowSummary(true)

    try {
      const params = new URLSearchParams({
        url: url,
        filingType: alertType,
      })

      const response = await fetch(`${GROK_API_URL}?${params}`)
      const data = await response.json()

      if (data.success && data.summary) {
        setSummary(data.summary)
      } else {
        setError(data.error || 'Failed to get summary')
      }
    } catch (err) {
      setError('Failed to connect to Grok API')
      console.error('Grok API error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [url, alertType])

  const handleClose = useCallback(() => {
    setShowSummary(false)
  }, [])

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          fetchGrokSummary()
        }}
        disabled={isLoading}
        className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#6b4ce6] hover:bg-[#7c5cf7] disabled:opacity-50 transition-colors"
        title="Analyze with Grok AI"
      >
        {isLoading ? (
          <span className="text-xs text-white">...</span>
        ) : (
          <span className="text-xs">🤖</span>
        )}
      </button>

      {showSummary && (
        <GrokSummary
          symbol={symbol}
          alertType={alertType}
          alertText={alertText}
          summary={summary}
          error={error}
          isLoading={isLoading}
          displayMode={displayMode}
          onClose={handleClose}
        />
      )}
    </>
  )
}
