"use client"

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'

export function ChartPanel() {
  const { chartMode, toggleChartMode, selectedSymbol, quotes } = useStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [size, setSize] = useState({ width: 800, height: 500 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const quote = selectedSymbol ? quotes[selectedSymbol] : null

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chart-resize-handle')) return
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, e.clientX - dragOffset.current.x),
        y: Math.max(0, e.clientY - dragOffset.current.y)
      })
    }

    const handleMouseUp = () => setIsDragging(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Handle resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizing(true)
    dragOffset.current = {
      x: e.clientX,
      y: e.clientY
    }
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragOffset.current.x
      const deltaY = e.clientY - dragOffset.current.y
      dragOffset.current = { x: e.clientX, y: e.clientY }
      setSize(prev => ({
        width: Math.max(400, prev.width + deltaX),
        height: Math.max(300, prev.height + deltaY)
      }))
    }

    const handleMouseUp = () => setIsResizing(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Load TradingView widget
  useEffect(() => {
    if (!chartMode || !selectedSymbol || !containerRef.current) return

    const widgetContainer = containerRef.current.querySelector('.tv-widget-container')
    if (!widgetContainer) return

    widgetContainer.innerHTML = ''

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
    widgetContainer.appendChild(wrapper)

    return () => {
      if (widgetContainer) {
        widgetContainer.innerHTML = ''
      }
    }
  }, [chartMode, selectedSymbol])

  if (!chartMode) return null

  return (
    <div
      ref={containerRef}
      className="fixed z-50 glass-panel rounded-lg overflow-hidden shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        border: '1px solid var(--border-glass)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}
    >
      {/* Header - Draggable */}
      <div
        className="glass-header px-3 py-2 flex items-center justify-between cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
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
        <button
          onClick={toggleChartMode}
          className="text-gray-400 hover:text-white p-1"
          title="Close chart"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Chart Container */}
      <div
        className="tv-widget-container"
        style={{
          height: 'calc(100% - 44px)',
          width: '100%',
          background: 'var(--bg-primary)'
        }}
      >
        {!selectedSymbol && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            Select a symbol to view chart
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        className="chart-resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeMouseDown}
        style={{
          background: 'linear-gradient(135deg, transparent 50%, var(--accent-primary) 50%)',
          opacity: 0.5
        }}
      />
    </div>
  )
}
