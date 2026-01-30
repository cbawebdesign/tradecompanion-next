"use client"

import { useEffect, useRef, memo } from 'react'
import { useStore } from '@/store/useStore'

interface TradingViewChartProps {
  symbol?: string
  height?: number | string
  theme?: 'dark' | 'light'
}

function TradingViewChartInner({ symbol, height = 400, theme = 'dark' }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const appTheme = useStore((s) => s.config.theme)

  // Map app themes to TradingView themes
  const tvTheme = appTheme === 'wallst' ? 'dark' : 'dark' // TradingView only has dark/light

  useEffect(() => {
    if (!containerRef.current || !symbol) return

    // Clear previous widget
    containerRef.current.innerHTML = ''

    // Create the TradingView widget
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: 'D',
      timezone: 'America/New_York',
      theme: tvTheme,
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

    const container = document.createElement('div')
    container.className = 'tradingview-widget-container'
    container.style.height = '100%'
    container.style.width = '100%'

    const widgetContainer = document.createElement('div')
    widgetContainer.className = 'tradingview-widget-container__widget'
    widgetContainer.style.height = 'calc(100% - 32px)'
    widgetContainer.style.width = '100%'

    container.appendChild(widgetContainer)
    container.appendChild(script)
    containerRef.current.appendChild(container)

    widgetRef.current = container

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [symbol, tvTheme])

  if (!symbol) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-muted)', background: 'var(--bg-glass)' }}
      >
        Select a symbol to view chart
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: '100%',
        background: 'var(--bg-primary)',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    />
  )
}

// Memoize to prevent unnecessary re-renders
export const TradingViewChart = memo(TradingViewChartInner)

// Mini chart widget for smaller spaces
interface MiniChartProps {
  symbol?: string
  width?: number | string
  height?: number
}

function TradingViewMiniChartInner({ symbol, width = '100%', height = 220 }: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appTheme = useStore((s) => s.config.theme)
  const tvTheme = appTheme === 'wallst' ? 'dark' : 'dark'

  useEffect(() => {
    if (!containerRef.current || !symbol) return

    containerRef.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol: symbol,
      width: '100%',
      height: height,
      locale: 'en',
      dateRange: '1D',
      colorTheme: tvTheme,
      isTransparent: true,
      autosize: false,
      largeChartUrl: '',
      noTimeScale: false,
      chartOnly: false,
    })

    const container = document.createElement('div')
    container.className = 'tradingview-widget-container'

    const widgetContainer = document.createElement('div')
    widgetContainer.className = 'tradingview-widget-container__widget'

    container.appendChild(widgetContainer)
    container.appendChild(script)
    containerRef.current.appendChild(container)

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [symbol, tvTheme, height])

  if (!symbol) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height: `${height}px`,
          color: 'var(--text-muted)',
          background: 'var(--bg-glass)',
          borderRadius: '8px'
        }}
      >
        No symbol selected
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: `${height}px`,
        overflow: 'hidden',
        borderRadius: '8px'
      }}
    />
  )
}

export const TradingViewMiniChart = memo(TradingViewMiniChartInner)
