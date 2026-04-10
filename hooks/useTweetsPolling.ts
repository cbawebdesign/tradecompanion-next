"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
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

export function useTweetsPolling() {
  const { config, addAlert, addAlerts } = useStore()
  const lastTweetIdRef = useRef<number | null>(null)
  const seenTweetIdsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!config.hubUrl) return

    // Get base URL from hubUrl
    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const tweetsUrl = `${baseUrl}/api/tweets`

    let cancelled = false

    async function fetchTweets() {
      try {
        // Azure API requires 'since' parameter (id_long)
        // Use 0 for initial fetch to get recent tweets
        const sinceId = lastTweetIdRef.current ?? 0
        const url = `${tweetsUrl}?since=${sinceId}`

        console.log('Tweets: fetching from', url)
        const response = await fetch(proxyUrl(url))
        if (!response.ok) {
          const text = await response.text()
          console.log('Tweets fetch failed:', response.status, text)
          return
        }

        const tweets: Tweet[] = await response.json()
        console.log('Tweets: got', tweets.length, 'tweets, sinceId was', sinceId)

        if (tweets.length === 0) return

        // Process new tweets (oldest first, using id_long which is chronological)
        const sortedTweets = [...tweets].sort((a, b) => a.id_long - b.id_long)

        // On initial load (sinceId was 0), only process the most recent 100 tweets
        // to avoid overwhelming the alerts list
        const tweetsToProcess = sinceId === 0
          ? sortedTweets.slice(-100)
          : sortedTweets

        // Build batch of new alerts
        const batch: Alert[] = []
        for (const tweet of tweetsToProcess) {
          if (seenTweetIdsRef.current.has(tweet.id_long)) continue
          seenTweetIdsRef.current.add(tweet.id_long)

          const symbols = extractSymbols(tweet.text)
          // Build X.com URL from username + tweet id (same as legacy X.cs)
          const tweetUrl = tweet.username && tweet.id_long
            ? `https://x.com/${tweet.username}/status/${tweet.id_long}`
            : undefined
          batch.push({
            id: crypto.randomUUID(),
            symbol: symbols[0] || '',
            message: `@${tweet.username}: ${tweet.text}`,
            type: 'tweet',
            color: '#1da1f2',
            timestamp: new Date(tweet.created_at),
            read: false,
            url: tweetUrl,
          })
        }

        // Single store update for all new tweets
        if (batch.length > 0) {
          if (sinceId === 0) addAlerts(batch)  // Initial load: batch
          else batch.forEach(a => addAlert(a)) // Subsequent: one-by-one for live feel
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
      }
    }

    // Stagger initial fetch to avoid ERR_INSUFFICIENT_RESOURCES
    const initTimer = setTimeout(fetchTweets, 500)

    // Poll every 30 seconds
    const interval = setInterval(() => {
      if (!cancelled) {
        fetchTweets()
      }
    }, 30000)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      clearInterval(interval)
    }
  }, [config.hubUrl, addAlert])
}
