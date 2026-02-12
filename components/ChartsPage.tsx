"use client"

import { useState, useEffect, useRef } from 'react'

interface ChartBoxProps {
  index: number
  symbol: string
  onSymbolChange: (symbol: string) => void
}

function ChartBox({ index, symbol, onSymbolChange }: ChartBoxProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState(symbol)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = inputValue.trim().toUpperCase()
    if (cleaned) {
      onSymbolChange(cleaned)
    }
  }

  // Load TradingView widget
  useEffect(() => {
    if (!symbol || !containerRef.current) return

    containerRef.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
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

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [symbol])

  return (
    <div className="glass-panel rounded-lg overflow-hidden flex flex-col" style={{ border: '1px solid var(--border-glass)' }}>
      {/* Symbol Input Header */}
      <form onSubmit={handleSubmit} className="glass-header px-3 py-2 flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>#{index + 1}</span>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.toUpperCase())}
          placeholder="Enter symbol..."
          className="flex-1 px-2 py-1 rounded text-sm font-medium"
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            color: 'var(--accent-primary)',
          }}
        />
        <button
          type="submit"
          className="px-2 py-1 rounded text-xs"
          style={{
            background: 'var(--accent-primary)',
            color: 'var(--text-primary)',
          }}
        >
          Load
        </button>
      </form>

      {/* Chart Container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ background: 'var(--bg-primary)' }}
      >
        {!symbol && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            Enter a symbol above
          </div>
        )}
      </div>
    </div>
  )
}

export function ChartsPage() {
  // Store symbols in state - could persist to localStorage later
  const [symbols, setSymbols] = useState<string[]>(['SPY', 'QQQ', 'AAPL', 'TSLA'])

  const handleSymbolChange = (index: number, symbol: string) => {
    setSymbols(prev => {
      const updated = [...prev]
      updated[index] = symbol
      return updated
    })
  }

  return (
    <div className="h-full p-4 grid grid-cols-2 grid-rows-2 gap-4">
      {symbols.map((symbol, index) => (
        <ChartBox
          key={index}
          index={index}
          symbol={symbol}
          onSymbolChange={(s) => handleSymbolChange(index, s)}
        />
      ))}
    </div>
  )
}
