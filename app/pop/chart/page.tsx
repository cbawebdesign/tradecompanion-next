"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'

export default function ChartPopout() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { selectedSymbol, quotes } = useStore()
  const quote = selectedSymbol ? quotes[selectedSymbol] : null

  // Load TradingView widget
  useEffect(() => {
    if (!selectedSymbol || !containerRef.current) return

    containerRef.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: selectedSymbol,
      interval: 'D',
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      support_host: 'https://www.tradingview.com',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      hide_volume: false,
      backgroundColor: 'rgba(0, 0, 0, 0)',
    })

    const wrapper = document.createElement('div')
    wrapper.className = 'tradingview-widget-container'
    wrapper.style.height = '100%'
    wrapper.style.width = '100%'

    const innerDiv = document.createElement('div')
    innerDiv.className = 'tradingview-widget-container__widget'
    innerDiv.style.height = '100%'
    innerDiv.style.width = '100%'

    wrapper.appendChild(innerDiv)
    wrapper.appendChild(script)
    containerRef.current.appendChild(wrapper)

    // Update window title
    document.title = `Chart: ${selectedSymbol}`

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [selectedSymbol])

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <div className="px-3 py-2 glass-header flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>
            {selectedSymbol || 'No Symbol'}
          </span>
          {quote && (
            <span className={quote.change >= 0 ? 'text-green-400' : 'text-red-400'}>
              ${quote.last?.toFixed(2)} ({quote.changePercent >= 0 ? '+' : ''}{quote.changePercent?.toFixed(2)}%)
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Select symbol in main window
        </span>
      </div>

      {/* Chart Container */}
      <div
        ref={containerRef}
        className="flex-1"
        style={{ background: 'var(--bg-primary)' }}
      >
        {!selectedSymbol && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            Select a symbol in the main window to view chart
          </div>
        )}
      </div>
    </div>
  )
}
