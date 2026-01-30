"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useSignalR } from '@/hooks/useSignalR'

function SignalRProvider({ children }: { children: React.ReactNode }) {
  useSignalR()
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
      <SignalRProvider>
        {children}
      </SignalRProvider>
    </QueryClientProvider>
  )
}
