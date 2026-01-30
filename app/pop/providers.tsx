"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useCrossWindowSync } from '@/hooks/useCrossWindowSync'
import { useQuoteReceiver } from '@/hooks/useQuoteBroadcast'

// Lightweight provider for pop-out windows
// Receives quotes from main window via BroadcastChannel
// Syncs other state via localStorage
// Does NOT run SignalR or polling hooks
function PopoutSyncProvider({ children }: { children: React.ReactNode }) {
  useCrossWindowSync() // Sync watchlists, alerts, flags with main window
  useQuoteReceiver() // Receive quotes from main window
  return <>{children}</>
}

export function PopoutProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
        refetchOnWindowFocus: false,
      },
    },
  }))

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PopoutSyncProvider>
        {children}
      </PopoutSyncProvider>
    </QueryClientProvider>
  )
}
