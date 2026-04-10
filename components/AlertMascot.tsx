"use client"

import { useStore } from '@/store/useStore'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Alert } from '@/types'

// Mascot character collections
const MASCOT_CHARACTERS = {
  classic: {
    label: 'Classic',
    idle: 'https://assets.masko.ai/fdb9a7/test-fc3c/analyzing-charts-a7ca4216.png',
    celebrate: 'https://assets.masko.ai/fdb9a7/test-fc3c/market-celebration-bf9cc56f.png',
    celebrateWebm: 'https://assets.masko.ai/fdb9a7/test-fc3c/market-celebration-2c7503fe.webm',
    celebrateMov: 'https://assets.masko.ai/fdb9a7/test-fc3c/market-celebration-1fb4f67d.mov',
  },
  bullish: {
    label: 'Bullish',
    idle: 'https://assets.masko.ai/fdb9a7/new-mascot-52ee/bullish-celebration-c2c81650.png',
    celebrate: 'https://assets.masko.ai/fdb9a7/new-mascot-52ee/bullish-celebration-e2110d81.png',
    celebrateWebm: 'https://assets.masko.ai/fdb9a7/new-mascot-52ee/bullish-celebration-07a4fabb.webm',
    celebrateMov: 'https://assets.masko.ai/fdb9a7/new-mascot-52ee/bullish-celebration-f1d9fead.mp4',
  },
  shouting: {
    label: 'Shouting Orders',
    idle: 'https://assets.masko.ai/fdb9a7/trade-companion-a7cf/shouting-orders-036d8a5a.png',
    celebrate: 'https://assets.masko.ai/fdb9a7/trade-companion-a7cf/shouting-orders-7b4ff630.png',
    celebrateWebm: 'https://assets.masko.ai/fdb9a7/trade-companion-a7cf/shouting-orders-f8ebc6c6.webm',
    celebrateMov: 'https://assets.masko.ai/fdb9a7/trade-companion-a7cf/shouting-orders-c6141823.mov',
  },
} as const

export type MascotCharacter = keyof typeof MASCOT_CHARACTERS
export { MASCOT_CHARACTERS }

const SIZE_MAP = { sm: 80, md: 120, lg: 160 } as const
const POPOUT_SIZE = 240

interface AlertMascotProps {
  isPopout?: boolean
}

export function AlertMascot({ isPopout = false }: AlertMascotProps) {
  const { config, alerts, mascotPosition, setMascotPosition } = useStore()
  const [currentAlert, setCurrentAlert] = useState<Alert | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [showSpeech, setShowSpeech] = useState(false)
  const [speechFading, setSpeechFading] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [videoPlaying, setVideoPlaying] = useState(false)

  const prevAlertCountRef = useRef(alerts.length)
  const videoRef = useRef<HTMLVideoElement>(null)
  const speechTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const isDraggingRef = useRef(false)
  const hasDraggedRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const size = isPopout ? POPOUT_SIZE : (SIZE_MAP[config.mascotSize] || SIZE_MAP.md)
  const assets = MASCOT_CHARACTERS[config.mascotCharacter] || MASCOT_CHARACTERS.classic

  // Detect new alerts
  useEffect(() => {
    if (alerts.length > prevAlertCountRef.current && alerts.length > 0) {
      const newAlert = alerts[0]
      triggerAlert(newAlert)
    }
    prevAlertCountRef.current = alerts.length
  }, [alerts.length])

  const triggerAlert = useCallback((alert: Alert) => {
    setCurrentAlert(alert)
    setIsAnimating(true)
    setShowSpeech(true)
    setSpeechFading(false)

    // Play transparent video
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().then(() => setVideoPlaying(true)).catch(() => {})
    }

    if (speechTimerRef.current) clearTimeout(speechTimerRef.current)

    // Show celebration for 4s, then fade speech and return to idle
    speechTimerRef.current = setTimeout(() => {
      setSpeechFading(true)
      setTimeout(() => {
        setShowSpeech(false)
        setSpeechFading(false)
        setIsAnimating(false)
        setVideoPlaying(false)
        setCurrentAlert(null)
      }, 300)
    }, 4000)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current)
    }
  }, [])

  // Drag handlers (only for inline mode)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isPopout || e.button !== 0) return
    isDraggingRef.current = true
    hasDraggedRef.current = false
    dragOffsetRef.current = {
      x: e.clientX - mascotPosition.x,
      y: e.clientY - mascotPosition.y,
    }
    e.preventDefault()
  }, [isPopout, mascotPosition])

  useEffect(() => {
    if (isPopout) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      hasDraggedRef.current = true
      const x = Math.max(0, Math.min(window.innerWidth - size, e.clientX - dragOffsetRef.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - size, e.clientY - dragOffsetRef.current.y))
      setMascotPosition({ x, y })
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPopout, size, setMascotPosition])

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }, [])

  // Close context menu on click anywhere
  useEffect(() => {
    if (!showContextMenu) return
    const close = () => setShowContextMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [showContextMenu])

  // Click to dismiss current alert (only if not dragging)
  const handleClick = useCallback(() => {
    if (hasDraggedRef.current) return
    if (currentAlert) {
      setShowSpeech(false)
      setSpeechFading(false)
      setIsAnimating(false)
      setVideoPlaying(false)
      setCurrentAlert(null)
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current)
    }
  }, [currentAlert])

  // Pop out the mascot into its own window
  const handlePopOut = useCallback(() => {
    const w = POPOUT_SIZE + 40 // tight around mascot
    const h = POPOUT_SIZE + 120 // room for speech bubble above
    const left = window.screen.width - w - 20
    const top = window.screen.height - h - 60
    window.open(
      '/pop/mascot',
      'tc-mascot',
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=no,resizable=yes,status=no`
    )
    // Hide the inline mascot since it's now popped out
    useStore.getState().updateConfig({ mascotEnabled: false })
    setShowContextMenu(false)
  }, [])

  if (!isPopout && !config.mascotEnabled) return null

  // Position: fixed for inline, centered for popout
  const posX = mascotPosition.x
  const posY = mascotPosition.y < 0
    ? Math.max(0, window.innerHeight + mascotPosition.y)
    : mascotPosition.y

  const containerStyle = isPopout
    ? { width: size }
    : {
        left: posX,
        top: posY,
        width: size,
        cursor: isDraggingRef.current ? 'grabbing' : 'grab',
      }

  return (
    <>
      <div
        ref={containerRef}
        className={isPopout ? 'relative select-none' : 'fixed z-50 select-none'}
        style={containerStyle}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
      >
        {/* Speech Bubble */}
        {showSpeech && currentAlert && (
          <div
            className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 glass-panel rounded-lg p-3 pointer-events-none ${
              speechFading ? 'speech-bubble-out' : 'speech-bubble-in'
            }`}
          >
            <div className="text-xs font-bold truncate" style={{ color: 'var(--accent-primary)' }}>
              {currentAlert.symbol}
            </div>
            <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
              {currentAlert.message}
            </div>
            {/* Speech bubble arrow */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid var(--border-glass)',
              }}
            />
          </div>
        )}

        {/* Mascot */}
        <div className={isAnimating ? 'mascot-alert' : 'mascot-idle'} style={{ position: 'relative' }}>
          {/* Transparent celebration video (WebM with alpha) */}
          <video
            ref={videoRef}
            muted
            playsInline
            preload="auto"
            className="w-full h-auto"
            style={{
              display: isAnimating && videoPlaying ? 'block' : 'none',
              filter: 'drop-shadow(0 4px 16px var(--shadow-color)) drop-shadow(0 0 20px var(--accent-glow))',
            }}
            onEnded={() => setVideoPlaying(false)}
          >
            <source src={assets.celebrateWebm} type="video/webm" />
            <source src={assets.celebrateMov} type="video/quicktime" />
          </video>

          {/* Static image — idle or celebrate fallback when video not playing */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={isAnimating && !videoPlaying ? assets.celebrate : assets.idle}
            alt="Trade Companion Mascot"
            width={size}
            height={size}
            className="w-full h-auto"
            style={{
              display: isAnimating && videoPlaying ? 'none' : 'block',
              filter: `drop-shadow(0 4px 16px var(--shadow-color))${isAnimating ? ' drop-shadow(0 0 20px var(--accent-glow))' : ''}`,
            }}
            draggable={false}
          />

          {/* Glow ring behind mascot on alert */}
          {isAnimating && (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
                transform: 'scale(1.3)',
                zIndex: -1,
              }}
            />
          )}
        </div>
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          className="fixed z-[60] glass-panel rounded-lg py-1 min-w-[160px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          {!isPopout && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onClick={() => {
                setMascotPosition({ x: 20, y: -200 })
                setShowContextMenu(false)
              }}
            >
              Reset Position
            </button>
          )}
          {!isPopout && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onClick={handlePopOut}
            >
              Pop Out to Desktop
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => {
              if (isPopout) {
                window.close()
              } else {
                useStore.getState().updateConfig({ mascotEnabled: false })
              }
              setShowContextMenu(false)
            }}
          >
            {isPopout ? 'Close Window' : 'Hide Mascot'}
          </button>
          <div className="my-1" style={{ borderTop: '1px solid var(--border-glass)' }} />
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
            style={{ color: 'var(--accent-primary)' }}
            onClick={() => {
              const symbols = ['AAPL', 'TSLA', 'NVDA', 'AMD', 'AMZN', 'GOOG', 'META']
              const messages = [
                'Price broke above resistance!',
                'New SEC filing: 10-K Annual Report',
                'Unusual volume detected - 3x average',
                'Earnings beat estimates by 15%',
                'Insider purchase: CEO bought 50k shares',
              ]
              useStore.getState().addAlert({
                id: Date.now().toString(),
                symbol: symbols[Math.floor(Math.random() * symbols.length)],
                message: messages[Math.floor(Math.random() * messages.length)],
                type: 'price',
                color: '#4caf50',
                timestamp: new Date(),
                read: false,
              })
              setShowContextMenu(false)
            }}
          >
            Test Alert
          </button>
        </div>
      )}
    </>
  )
}
