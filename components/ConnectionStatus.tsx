"use client"

import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'

export function ConnectionStatus() {
  const connectionState = useStore((s) => s.connectionState)

  const statusConfig = {
    connected: { color: 'bg-green-500', textClass: 'status-connected', text: 'Connected' },
    connecting: { color: 'bg-yellow-500', textClass: 'status-connecting', text: 'Connecting...' },
    reconnecting: { color: 'bg-yellow-500', textClass: 'status-connecting', text: 'Reconnecting...' },
    disconnected: { color: 'bg-red-500', textClass: 'status-disconnected', text: 'Disconnected' },
  }

  const { color, textClass, text } = statusConfig[connectionState]
  // Header space is tight (Justin, "UI"): a green dot says enough when all is
  // well. Any other state still spells itself out — that is the one you need
  // to notice.
  const showText = connectionState !== 'connected'

  return (
    <div className="flex items-center gap-2 text-xs" title={text}>
      <span
        className={clsx('w-2 h-2 rounded-full', color)}
        style={{ boxShadow: connectionState === 'connected' ? '0 0 8px rgba(34, 197, 94, 0.6)' : connectionState === 'disconnected' ? '0 0 8px rgba(239, 68, 68, 0.6)' : '0 0 8px rgba(234, 179, 8, 0.6)' }}
      />
      {showText && <span className={textClass}>{text}</span>}
    </div>
  )
}
