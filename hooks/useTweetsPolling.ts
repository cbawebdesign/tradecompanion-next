"use client"

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'
import type { Alert } from '@/types'

// Matches cosmos_tweet from Azure backend.
// id_long is serialized as a string (not number) because Twitter IDs are
// 18-19 digits — JS number type loses precision past 2^53 (16 digits),
// which would corrupt URLs like https://x.com/{user}/status/{id}.
interface Tweet {
  id: string
  username: string
  created_at: string
  text: string
  save_time: string
  id_long: string
}

// Extract stock symbols from tweet text ($AAPL, $TSLA, etc.)
function extractSymbols(text: string): string[] {
  const matches = text.match(/\$[A-Z]{1,5}/g) || []
  return matches.map(s => s.replace('$', ''))
}

export function useTweetsPolling() {
  const { config, addAlert, addAlerts, watchlists } = useStore()
  const lastTweetIdRef = useRef<string | null>(null)
  const seenTweetIdsRef = useRef<Set<string>>(new Set())
  const watchlistsRef = useRef(watchlists)
  watchlistsRef.current = watchlists

  useEffect(() => {
    if (!config.hubUrl) return

    // Get base URL from hubUrl
    const baseUrl = config.hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    const tweetsUrl = `${baseUrl}/api/tweets`

    let cancelled = false

    async function fetchTweets() {
      try {
        // Azure API requires 'since' parameter (id_long)
        // Use "0" for initial fetch to get recent tweets.
        const sinceId = lastTweetIdRef.current ?? '0'
        const url = `${tweetsUrl}?since=${sinceId}`

        // console.log('Tweets: fetching from', url)
        const response = await fetch(proxyUrl(url))
        if (!response.ok) {
          const text = await response.text()
          console.log('Tweets fetch failed:', response.status, text)
          return
        }

        const tweets: Tweet[] = await response.json()
        if (tweets.length > 0 && sinceId !== '0') console.log('Tweets:', tweets.length, 'new')

        if (tweets.length === 0) return

        // Process new tweets (oldest first, using id_long which is chronological).
        // Use BigInt compare — id_long is a 19-digit string; lexicographic compare
        // breaks once IDs grow/shrink in length, BigInt doesn't.
        const sortedTweets = [...tweets].sort((a, b) => {
          const ai = BigInt(a.id_long || '0')
          const bi = BigInt(b.id_long || '0')
          return ai < bi ? -1 : ai > bi ? 1 : 0
        })

        // On initial load (sinceId was "0"), only process the most recent 100 tweets
        // to avoid overwhelming the alerts list
        const tweetsToProcess = sinceId === '0'
          ? sortedTweets.slice(-100)
          : sortedTweets

        // Build batch of new alerts
        const batch: Alert[] = []
        for (const tweet of tweetsToProcess) {
          if (seenTweetIdsRef.current.has(tweet.id_long)) continue
          seenTweetIdsRef.current.add(tweet.id_long)

          const symbols = extractSymbols(tweet.text)
          // Always build URL if we have username + any ID
          const tweetId = tweet.id_long || tweet.id || ''
          const tweetUrl = (tweet.username && tweetId)
            ? `https://x.com/${tweet.username}/status/${tweetId}`
            : undefined
          const tweetText = `@${tweet.username}: ${tweet.text}`
          const tweetTime = new Date(tweet.created_at)

          // Fire a separate alert for EACH watchlisted symbol in the tweet
          // (Legacy X.cs has `break` after first match — that's a known bug we're fixing here)
          const watchlistSymbols = new Set(
            watchlistsRef.current.flatMap(w => w.symbols.map(s => s.symbol.toUpperCase()))
          )
          const matchedSymbols = symbols.filter(s => watchlistSymbols.has(s))

          if (matchedSymbols.length > 0) {
            for (const sym of matchedSymbols) {
              batch.push({
                id: crypto.randomUUID(),
                dedupKey: `tweet:${tweet.id_long}:${sym}`,
                source: 'useTweetsPolling',
                symbol: sym,
                message: tweetText,
                type: 'tweet',
                color: '#1da1f2',
                timestamp: tweetTime,
                read: false,
                url: tweetUrl,
              })
            }
          } else {
            // No watchlist match — still show with first symbol (or empty)
            batch.push({
              id: crypto.randomUUID(),
              dedupKey: `tweet:${tweet.id_long}`,
              source: 'useTweetsPolling',
              symbol: symbols[0] || '',
              message: tweetText,
              type: 'tweet',
              color: '#1da1f2',
              timestamp: tweetTime,
              read: false,
              url: tweetUrl,
            })
          }
        }

        // Single store update for all new tweets
        if (batch.length > 0) {
          if (sinceId === '0') addAlerts(batch)  // Initial load: batch
          else batch.forEach(a => addAlert(a))   // Subsequent: one-by-one for live feel
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
