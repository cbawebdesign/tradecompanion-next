"use client"

import { useEffect, useCallback } from 'react'
import { clsx } from 'clsx'

interface GrokSummaryProps {
  symbol: string
  alertType: string
  alertText: string
  summary: string | null
  error: string | null
  isLoading: boolean
  displayMode: 'modal' | 'slideout' | 'inline'
  onClose: () => void
}

export function GrokSummary({
  symbol,
  alertType,
  alertText,
  summary,
  error,
  isLoading,
  displayMode,
  onClose,
}: GrokSummaryProps) {
  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Format markdown-style text to HTML
  const formatSummary = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- /gm, '• ')
      .replace(/\n/g, '<br />')
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#3d3d5c]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <h3 className="font-semibold text-white">{symbol}</h3>
            <p className="text-xs text-gray-400">{alertType}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl"
        >
          ×
        </button>
      </div>

      {/* Alert Text */}
      <div className="px-4 py-2 bg-[#2a2a3e] text-sm text-gray-300">
        {alertText}
      </div>

      {/* Summary Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl animate-bounce">🤖</span>
            <p className="text-gray-400">Analyzing with Grok AI...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-300">
            {error}
          </div>
        ) : summary ? (
          <div
            className="text-gray-200 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatSummary(summary) }}
          />
        ) : (
          <p className="text-gray-500">No summary available</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#3d3d5c] text-xs text-gray-500">
        Powered by Grok AI • Press ESC to close
      </div>
    </div>
  )

  if (displayMode === 'modal') {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          className="bg-[#1e1e2e] border border-[#3d3d5c] rounded-lg shadow-2xl w-full max-w-[650px] max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    )
  }

  if (displayMode === 'slideout') {
    return (
      <div className="fixed inset-0 z-50" onClick={onClose}>
        <div
          className="absolute right-0 top-0 bottom-0 w-[420px] bg-[#1e1e2e] border-l border-[#3d3d5c] shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    )
  }

  // Inline mode
  return (
    <div className="bg-[#1e1e2e] border border-[#3d3d5c] rounded-lg mt-2">
      {content}
    </div>
  )
}
