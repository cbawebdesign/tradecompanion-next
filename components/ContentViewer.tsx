"use client"

import { useState, useCallback, useEffect } from 'react'

const GROK_API_URL = 'https://tradecompanion-grok.azurewebsites.net/api/groksummary-func'

interface ContentViewerProps {
  url: string
  symbol: string
  alertType: string
  alertText: string
  onClose: () => void
}

export function ContentViewer({
  url,
  symbol,
  alertType,
  alertText,
  onClose,
}: ContentViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Check if this is a tweet/X post
  const isTweet = alertType.toLowerCase().includes('tweet') ||
    url.includes('twitter.com') ||
    url.includes('t.co') ||
    url.includes('x.com')

  // Parse tweet username from alert text
  const getTweetUsername = () => {
    const colonIndex = alertText.indexOf(':')
    if (colonIndex > 0) {
      return alertText.substring(0, colonIndex).trim()
    }
    return 'User'
  }

  // Fetch content
  useEffect(() => {
    const fetchContent = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          url: url,
          filingType: alertType,
          contentOnly: 'true',
        })

        const response = await fetch(`${GROK_API_URL}?${params}`)
        const data = await response.json()

        if (data.success && data.content) {
          setContent(data.content)
        } else {
          setError(data.error || 'Failed to fetch content')
        }
      } catch (err) {
        setError('Failed to connect to content API')
        console.error('Content fetch error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchContent()
  }, [url, alertType])

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[#1e1e2e] border border-[#3d3d5c] rounded-lg shadow-2xl w-full max-w-[700px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#3d3d5c]">
          <div className="flex items-center gap-3">
            {isTweet ? (
              <span className="text-2xl">𝕏</span>
            ) : (
              <span className="text-2xl">📄</span>
            )}
            <div>
              <h3 className="font-semibold text-white">
                {isTweet ? getTweetUsername() : symbol}
              </h3>
              <p className="text-xs text-gray-400">
                {isTweet ? `@${symbol}` : alertType}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        {/* Alert Headline */}
        <div className="px-4 py-2 bg-[#2a2a3e] text-sm text-gray-300 border-b border-[#3d3d5c]">
          {alertText}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-32 gap-3">
              <div className="animate-spin text-2xl">⏳</div>
              <p className="text-gray-400">Loading content...</p>
            </div>
          ) : error ? (
            <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-300">
              {error}
            </div>
          ) : content ? (
            <div className="text-gray-200 leading-relaxed whitespace-pre-wrap">
              {content}
            </div>
          ) : (
            <p className="text-gray-500">No content available</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#3d3d5c] flex items-center justify-between">
          <span className="text-xs text-gray-500">Press ESC to close</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            View Original →
          </a>
        </div>
      </div>
    </div>
  )
}
