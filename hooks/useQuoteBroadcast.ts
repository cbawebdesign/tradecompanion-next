"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import type { Quote } from '@/types'

const CHANNEL_NAME = 'trade-companion-quotes'

// Main window broadcasts quotes to pop-out windows
export function useQuoteBroadcaster() {
  const { quotes } = useStore()
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastBroadcastRef = useRef<number>(0)

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_NAME)
    return () => channelRef.current?.close()
  }, [])

  // Broadcast quotes when they change (throttled to every 500ms)
  useEffect(() => {
    const now = Date.now()
    if (now - lastBroadcastRef.current < 500) return

    if (channelRef.current && Object.keys(quotes).length > 0) {
      channelRef.current.postMessage({ type: 'quotes', data: quotes })
      lastBroadcastRef.current = now
    }
  }, [quotes])
}

// Pop-out windows receive quotes from main window
export function useQuoteReceiver() {
  const { updateQuotes } = useStore()
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_NAME)

    channelRef.current.onmessage = (event) => {
      if (event.data?.type === 'quotes') {
        const quotesObj = event.data.data as Record<string, Quote>
        const quotesArray = Object.values(quotesObj)
        if (quotesArray.length > 0) {
          updateQuotes(quotesArray)
        }
      }
    }

    return () => channelRef.current?.close()
  }, [updateQuotes])
}
