"use client"

import { useState, useCallback } from 'react'

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
}: GrokButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)

    // Open window immediately (must be in click handler to avoid popup blocker)
    const win = window.open('', '_blank')
    if (!win) {
      setIsLoading(false)
      return
    }

    // Write loading state
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Grok Summary - ${symbol}</title>
      <style>
        body { background: #1e1e2e; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; }
        .header { padding: 18px 24px; border-bottom: 1px solid #3d3d5c; background: linear-gradient(135deg, #2a2a4a 0%, #1e1e2e 100%); }
        .header .label { color: #7c6cf0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px; }
        .header .title { color: #fff; font-size: 18px; font-weight: 600; margin-top: 4px; }
        .content { padding: 24px; max-width: 800px; font-size: 14px; line-height: 1.9; }
        .quote { color: #888; margin-bottom: 20px; font-size: 13px; font-style: italic; border-left: 3px solid #444; padding-left: 12px; }
        .loading { text-align: center; padding: 40px 20px; }
        .loading .icon { font-size: 24px; margin-bottom: 12px; }
        .loading .text { color: #7c6cf0; font-weight: 500; }
        .loading .sub { margin-top: 8px; color: #666; font-size: 13px; }
        .error { color: #ff6b6b; padding: 16px; background: #2a2020; border-radius: 8px; border: 1px solid #4a2020; }
        strong { color: #fff; }
      </style>
    </head><body>
      <div class="header">
        <div class="label">GROK SUMMARY</div>
        <div class="title">${symbol} - ${alertType}</div>
      </div>
      <div class="content">
        ${alertText ? `<div class="quote">${alertText.substring(0, 150).replace(/</g, '&lt;').replace(/>/g, '&gt;')}${alertText.length > 150 ? '...' : ''}</div>` : ''}
        <div class="loading">
          <div class="icon">🤖</div>
          <div class="text">Analyzing...</div>
          <div class="sub">Fetching content and generating summary</div>
        </div>
      </div>
    </body></html>`)

    try {
      const params = new URLSearchParams({
        url: url,
        filingType: alertType,
      })
      const response = await fetch(`${GROK_API_URL}?${params}`)
      const data = await response.json()

      const contentEl = win.document.querySelector('.content')
      if (contentEl) {
        const quoteHtml = alertText
          ? `<div class="quote">${alertText.substring(0, 150).replace(/</g, '&lt;').replace(/>/g, '&gt;')}${alertText.length > 150 ? '...' : ''}</div>`
          : ''
        if (data.success && data.summary) {
          const formattedSummary = data.summary
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>')
            .replace(/^- /gm, '&bull; ')
          contentEl.innerHTML = quoteHtml + `<div>${formattedSummary}</div>`
        } else {
          contentEl.innerHTML = quoteHtml + `<div class="error"><strong>Error:</strong> ${data.error || 'Unknown error'}</div>`
        }
      }
    } catch (err: any) {
      const contentEl = win.document.querySelector('.content')
      if (contentEl) {
        contentEl.innerHTML = `<div class="error"><strong>Error:</strong> ${err.message || 'Failed to fetch summary'}</div>`
      }
    }

    setIsLoading(false)
  }, [url, symbol, alertType, alertText, isLoading])

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        handleClick()
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
  )
}
