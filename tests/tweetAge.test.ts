import { describe, it, expect } from 'vitest'
import { isStaleTweet } from '@/lib/tweetAge'

describe('isStaleTweet', () => {
  const cutoff = '2026-11-18T21:00:00.000Z'   // Wed 4pm ET

  it("drops a tweet from months ago (AMD's May 6 tweet on flag)", () => {
    expect(isStaleTweet('2026-05-06T14:12:00.000Z', cutoff)).toBe(true)
  })

  it('keeps everything since the previous close', () => {
    expect(isStaleTweet('2026-11-18T21:00:00.000Z', cutoff)).toBe(false)
    expect(isStaleTweet('2026-11-19T09:31:00.000Z', cutoff)).toBe(false)
  })

  it('keeps a tweet whose time does not parse rather than lose it', () => {
    expect(isStaleTweet('', cutoff)).toBe(false)
    expect(isStaleTweet(undefined, cutoff)).toBe(false)
    expect(isStaleTweet('not a date', cutoff)).toBe(false)
  })

  it("reads the feed's created_at (ISO) and Twitter's own format", () => {
    expect(isStaleTweet('2026-05-05T23:41:50Z', cutoff)).toBe(true)
    expect(isStaleTweet('Wed May 06 14:12:00 +0000 2026', cutoff)).toBe(true)
  })
})
