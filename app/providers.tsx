"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useSignalR } from '@/hooks/useSignalR'
import { useTweetsPolling } from '@/hooks/useTweetsPolling'
import { useFilingsPolling } from '@/hooks/useFilingsPolling'
import { usePrevCloses } from '@/hooks/usePrevCloses'
import { usePriceAlerts } from '@/hooks/usePriceAlerts'
import { useCrossWindowSync } from '@/hooks/useCrossWindowSync'
import { useQuoteBroadcaster } from '@/hooks/useQuoteBroadcast'
import { useTradeExchangePolling } from '@/hooks/useTradeExchangePolling'
import { useCatalystPolling } from '@/hooks/useCatalystPolling'
import { useStore } from '@/store/useStore'

// Apply theme on mount and when it changes
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useStore((s) => s.config.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'blue')
  }, [theme])

  return <>{children}</>
}

function CloseConfirmation() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
  return null
}

function SignalRProvider({ children }: { children: React.ReactNode }) {
  useSignalR()
  useTweetsPolling() // Poll tweets API for Twitter alerts
  useFilingsPolling() // Poll filings API for SEC filings
  useTradeExchangePolling() // Poll Trade Exchange API for TX posts
  useCatalystPolling() // Poll Catalyst API for catalyst PRs
  usePrevCloses() // Fetch previous closes for % change calculation
  usePriceAlerts() // Check for upper/lower price alert triggers
  useCrossWindowSync() // Sync state across pop-out windows
  useQuoteBroadcaster() // Broadcast quotes to pop-out windows
  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  }))

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent hydration mismatch
  if (!mounted) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CloseConfirmation />
        <SignalRProvider>
          {children}
        </SignalRProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
