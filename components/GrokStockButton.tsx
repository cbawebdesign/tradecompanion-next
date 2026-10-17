"use client"

import { useState } from 'react'

interface GrokStockButtonProps {
  symbol: string
}

export function GrokStockButton({ symbol }: GrokStockButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()

    setIsLoading(true)
    setError(null)
    setResponse(null)
    setShowModal(true)

    try {
      // Goes through /api/grok so the xAI key stays server-side. Calling
      // api.x.ai from here would expose it in devtools to anyone with the
      // app open.
      const res = await fetch('/api/grok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Grok error ${res.status}`)
      }
      if (data.content) {
        setResponse(data.content)
      } else {
        throw new Error('No response from Grok')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response')
    } finally {
      setIsLoading(false)
    }
  }

  // Format markdown-style text
  const formatResponse = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--accent-primary)">$1</strong>')
      .replace(/^- /gm, '• ')
      .replace(/\n/g, '<br />')
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="p-1 rounded hover:bg-white/10 transition-colors"
        title={`Ask Grok about ${symbol}`}
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="text-xs animate-pulse">...</span>
        ) : (
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: 'var(--accent-primary)' }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="glass-panel rounded-lg max-w-xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            style={{ border: '1px solid var(--border-glass)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="glass-header px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>
                  {symbol}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Grok Analysis
                </span>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <span className="text-2xl animate-bounce mr-3">🤖</span>
                  <span style={{ color: 'var(--text-muted)' }}>Analyzing {symbol}...</span>
                </div>
              )}

              {error && (
                <div className="p-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <p className="text-red-400">{error}</p>
                </div>
              )}

              {response && (
                <div
                  className="leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatResponse(response) }}
                />
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 text-xs border-t" style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }}>
              Powered by Grok AI • Press ESC or click outside to close
            </div>
          </div>
        </div>
      )}
    </>
  )
}
