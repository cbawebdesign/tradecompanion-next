"use client"

import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'

export function ConnectionStatus() {
  const connectionState = useStore((s) => s.connectionState)

  const statusConfig = {
    connected: { color: 'bg-green-500', text: 'Connected' },
    connecting: { color: 'bg-yellow-500', text: 'Connecting...' },
    reconnecting: { color: 'bg-yellow-500', text: 'Reconnecting...' },
    disconnected: { color: 'bg-red-500', text: 'Disconnected' },
  }

  const { color, text } = statusConfig[connectionState]

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={clsx('w-2 h-2 rounded-full', color)} />
      <span className="text-gray-400">{text}</span>
    </div>
  )
}
