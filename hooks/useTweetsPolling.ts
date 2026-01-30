"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import type { Alert } from '@/types'

// Matches cosmos_tweet from Azure backend
interface Tweet {
  id: string
  username: string
  created_at: string
  text: string
  save_time: string
  id_long: number
}

// Extract stock symbols from tweet text ($AAPL, $TSLA, etc.)
function extractSymbols(text: string): string[] {
  const matches = text.match(/\$[A-Z]{1,5}/g) || []
  return matches.map(s => s.replace('$', ''))
}

// Track consecutive errors for backoff
let consecutiveErrors = 0
const BASE_POLL_INTERVAL = 30000 // 30 seconds
const MAX_BACKOFF = 300000 // 5 minutes max

export function useTweetsPolling() {
  const { config, addAlert } = useStore()
  const lastTweetIdRef = useRef<number | null>(null)
  const seenTweetIdsRef = useRef<Set<number>>(new Set())
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!config.hubUrl) return

    // Get base URL from hubUrl
    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const tweetsUrl = `${baseUrl}/api/tweets`

    let cancelled = false

    // Calculate next poll interval with exponential backoff on errors
    function getNextInterval(): number {
      if (consecutiveErrors === 0) return BASE_POLL_INTERVAL
      // Exponential backoff: 30s, 60s, 120s, up to 5 min max
      return Math.min(BASE_POLL_INTERVAL * Math.pow(2, consecutiveErrors), MAX_BACKOFF)
    }

    function scheduleNextPoll() {
      if (cancelled) return
      const interval = getNextInterval()
      if (consecutiveErrors > 0) {
        console.log(`Tweets: next poll in ${interval/1000}s (backoff due to ${consecutiveErrors} errors)`)
      }
      timeoutRef.current = setTimeout(() => {
        if (!cancelled) fetchTweets()
      }, interval)
    }

    async function fetchTweets() {
      try {
        // Azure API requires 'since' parameter (id_long)
        // Use 0 for initial fetch to get recent tweets
        const sinceId = lastTweetIdRef.current ?? 0
        const url = `${tweetsUrl}?since=${sinceId}`

        const response = await fetch(url)
        if (!response.ok) {
          const text = await response.text()
          console.log('Tweets fetch failed:', response.status, text)
          consecutiveErrors++
          scheduleNextPoll()
          return
        }

        // Success - reset error count
        consecutiveErrors = 0

        const tweets: Tweet[] = await response.json()

        if (tweets.length === 0) {
          scheduleNextPoll()
          return
        }

        // Process new tweets (oldest first, using id_long which is chronological)
        const sortedTweets = [...tweets].sort((a, b) => a.id_long - b.id_long)

        // On initial load (sinceId was 0), only process the most recent 100 tweets
        // to avoid overwhelming the alerts list
        const tweetsToProcess = sinceId === 0
          ? sortedTweets.slice(-100)
          : sortedTweets

        for (const tweet of tweetsToProcess) {
          // Skip if we've already seen this tweet (use id_long for tracking)
          if (seenTweetIdsRef.current.has(tweet.id_long)) continue
          seenTweetIdsRef.current.add(tweet.id_long)

          // Extract symbols from tweet
          const symbols = extractSymbols(tweet.text)
          const symbol = symbols[0] || '' // Use first symbol or empty

          // Create alert from tweet
          const alert: Alert = {
            id: crypto.randomUUID(),
            symbol,
            message: `@${tweet.username}: ${tweet.text}`,
            type: 'news',
            color: '#1da1f2', // Twitter/X blue
            timestamp: new Date(tweet.created_at),
            read: false,
          }

          addAlert(alert)
        }

        // Update last tweet ID for next fetch (use id_long)
        if (sortedTweets.length > 0) {
          lastTweetIdRef.current = sortedTweets[sortedTweets.length - 1].id_long
        }

        // Keep seen tweets set from growing too large
        if (seenTweetIdsRef.current.size > 1000) {
          const arr = Array.from(seenTweetIdsRef.current)
          seenTweetIdsRef.current = new Set(arr.slice(-500))
        }

      } catch (err) {
        console.error('Error fetching tweets:', err)
        consecutiveErrors++
      }

      // Schedule next poll
      scheduleNextPoll()
    }

    // Initial fetch
    fetchTweets()

    return () => {
      cancelled = true
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      consecutiveErrors = 0
    }
  }, [config.hubUrl, addAlert])
}
