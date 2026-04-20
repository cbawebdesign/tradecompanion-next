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
import { useNewsHub } from '@/hooks/useNewsHub'
import { useStockDataPreload } from '@/hooks/useStockDataPreload'
import { useAlertAuditor } from '@/hooks/useAlertAuditor'
import { useAirtablePolling } from '@/hooks/useAirtablePolling'
import { useCosmosSync } from '@/hooks/useCosmosSync'
import { useRemotePrBlacklist } from '@/hooks/useRemotePrBlacklist'
import { useStore } from '@/store/useStore'
import { LoginGate } from '@/components/LoginGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'

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

// Split hooks into isolated components so re-renders don't cascade.
// Previously all 13 hooks were in one component — when usePriceAlerts or
// useQuoteBroadcast triggered (every 250ms from quotes), ALL hooks re-ran.

function RealTimeConnection() {
  useSignalR()
  useNewsHub()
  return null
}

function QuoteProcessor() {
  // These subscribe to quotes (high-frequency) — isolated from other hooks
  usePriceAlerts()
  useQuoteBroadcaster()
  return null
}

function AlertPolling() {
  // REST polling hooks — fire on their own intervals, don't need quote updates
  useTweetsPolling()
  useFilingsPolling()
  useTradeExchangePolling()
  useCatalystPolling()
  useAlertAuditor()
  useAirtablePolling()
  return null
}

function DataSync() {
  // Background data sync — infrequent updates
  usePrevCloses()
  useStockDataPreload()
  useCrossWindowSync()
  useCosmosSync()
  useRemotePrBlacklist()
  return null
}

function SignalRProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RealTimeConnection />
      <QuoteProcessor />
      <AlertPolling />
      <DataSync />
      {children}
    </>
  )
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LoginGate>
            <CloseConfirmation />
            <SignalRProvider>
              {children}
            </SignalRProvider>
          </LoginGate>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
