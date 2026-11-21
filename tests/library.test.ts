import { describe, it, expect } from 'vitest'
import {
  clearAll, dismiss, ensureFeedStart, feedItems, formatLibraryTime, plainSummary, restoreFeed,
  results, savedItems, search, setHiddenSources, sourceKey, sourceList, toggleSave, undismiss, visibleToolbar, embedUrl,
  type LibraryItem, type LibraryState,
} from '@/lib/library'

const NOW = Date.parse('2026-11-19T15:00:00Z')

function item(id: string, over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id, kind: id.startsWith('v:') ? 'video' : 'article', name: 'TheOneLanceB',
    date: '2026-11-18T13:00:00Z', added: '2026-11-18T13:05:00Z',
    title: `Title ${id}`, link: null, youtubeId: null, tags: [], thumbnail: null, avatar: null,
    summary: null, tickers: [], ...over,
  }
}

describe('Library feed', () => {
  const start = ensureFeedStart(undefined, NOW)

  it('a first open starts the feed 7 days back', () => {
    expect(start.feedStart).toBe('2026-11-12T15:00:00.000Z')
    expect(ensureFeedStart(start, NOW + 86_400_000)).toBe(start)
  })

  it('shows items from the past 7 days and leaves older ones in the archive', () => {
    const items = [item('v:new'), item('v:old', { date: '2026-11-01T13:00:00Z' })]
    expect(feedItems(items, start).map(i => i.id)).toEqual(['v:new'])
  })

  it('an old video added to the base later does not land in the feed', () => {
    const backfill = item('v:bf', { date: '2025-03-01T13:00:00Z', added: '2026-11-19T14:00:00Z' })
    expect(feedItems([backfill], start)).toEqual([])
  })

  it('X removes one item, and undo brings it back', () => {
    const items = [item('v:1'), item('a:1')]
    const s = dismiss(start, 'v:1')
    expect(feedItems(items, s).map(i => i.id)).toEqual(['a:1'])
    expect(feedItems(items, undismiss(s, 'v:1')).map(i => i.id)).toEqual(['v:1', 'a:1'])
  })

  it('Clear all empties the feed, and items added afterwards still arrive', () => {
    const items = [item('v:1'), item('a:1', { added: '2026-11-18T20:00:00Z' })]
    const s = clearAll(dismiss(start, 'v:1'), items)
    expect(feedItems(items, s)).toEqual([])
    expect(s.clearedAt).toBe('2026-11-18T20:00:00.000Z')
    // Covered by the watermark now, so not kept as an individual dismissal.
    expect(s.dismissed).toEqual([])
    // Dated earlier than the click, but added after it: it's new to this user.
    const later = item('v:2', { date: '2026-11-18T12:00:00Z', added: '2026-11-19T14:30:00Z' })
    expect(feedItems([...items, later], s).map(i => i.id)).toEqual(['v:2'])
  })

  it('undo of Clear all restores the feed as it was', () => {
    const items = [item('v:1'), item('a:1')]
    const before = dismiss(start, 'a:1')
    const after = clearAll(before, items)
    expect(feedItems(items, restoreFeed(after, before)).map(i => i.id)).toEqual(['v:1'])
  })

  it('Clear all does not depend on this computer\'s clock', () => {
    const items = [item('v:1', { added: '2026-11-18T13:05:00Z' })]
    expect(clearAll(start, items).clearedAt).toBe('2026-11-18T13:05:00.000Z')
  })
})

describe('Sources', () => {
  const start = ensureFeedStart(undefined, NOW)
  const items = [
    item('v:1', { name: 'TheOneLanceB' }),
    item('v:2', { name: 'theonelanceb ' }),
    item('v:3', { name: 'Adam Grimes' }),
    item('a:1', { name: 'TheOneLanceB' }),
    item('a:2', { name: 'brian shannon' }),
  ]

  it('lists every creator A to Z, split into Videos and Articles, with counts', () => {
    const s = sourceList(items)
    expect(s.video.map(e => [e.name, e.count])).toEqual([['Adam Grimes', 1], ['TheOneLanceB', 2]])
    expect(s.article.map(e => e.name)).toEqual(['brian shannon', 'TheOneLanceB'])
  })

  it('a creator turned off leaves the feed, in that list only', () => {
    const s = setHiddenSources(start, [sourceKey('video', 'TheOneLanceB')], items)
    expect(feedItems(items, s).map(i => i.id)).toEqual(['v:3', 'a:1', 'a:2'])
  })

  it('a creator new to either base is on by default', () => {
    const s = setHiddenSources(start, [sourceKey('video', 'Adam Grimes')], items)
    const newcomer = item('v:9', { name: 'New Channel' })
    expect(feedItems([...items, newcomer], s).map(i => i.id)).toContain('v:9')
  })

  it('a creator turned off stays off while it has no records, and turning all back on clears the setting', () => {
    const gone = sourceKey('article', 'Old Letter')
    const s = setHiddenSources({ ...start, hiddenSources: [gone] }, [], items)
    expect(s.hiddenSources).toEqual([gone])
    expect(setHiddenSources(start, [], items).hiddenSources).toBeUndefined()
  })

  it('search still finds a creator that is turned off', () => {
    expect(search(items, 'grimes').map(i => i.id)).toEqual(['v:3'])
  })
})

describe('Saved', () => {
  it('★ saves to the top and a second ★ removes it', () => {
    let s: LibraryState = toggleSave(undefined, 'v:1')
    s = toggleSave(s, 'a:1')
    expect(s.saved).toEqual(['a:1', 'v:1'])
    expect(toggleSave(s, 'v:1').saved).toEqual(['a:1'])
  })

  it('an item deleted from Airtable drops out of Saved', () => {
    expect(savedItems([item('v:1')], { saved: ['v:gone', 'v:1'] }).map(i => i.id)).toEqual(['v:1'])
  })
})

describe('Toolbar tags', () => {
  const tags = [
    { tag: 'Trading Lessons', count: 70 }, { tag: 'Trading Psychology', count: 47 }, { tag: 'Trading Career', count: 39 },
    { tag: 'Habits & Performance', count: 35 }, { tag: 'Trading Playbook', count: 28 }, { tag: 'Risk Management', count: 24 },
    { tag: 'Chart Analysis', count: 23 },
  ]

  it('defaults to the top 6 in-use tags', () => {
    expect(visibleToolbar(undefined, tags)).toEqual(tags.slice(0, 6).map(t => t.tag))
  })

  it('hides a saved tag with no records, and it comes back when records use it again', () => {
    const s = { toolbarTags: ['Position Sizing', 'chart analysis'] }
    expect(visibleToolbar(s, tags)).toEqual(['Chart Analysis'])
    expect(visibleToolbar(s, [...tags, { tag: 'Position Sizing', count: 1 }])).toEqual(['Position Sizing', 'Chart Analysis'])
  })
})

describe('Search', () => {
  const items = [
    item('v:1', { title: 'Position sizing for beginners', tickers: ['NVDA'] }),
    item('a:1', { title: 'Weekend notes', summary: 'Why NVDA matters', name: 'The Setup Letter' }),
    item('v:2', { title: 'Risk', tags: ['Risk Management'] }),
  ]

  it('matches title, creator and summary', () => {
    expect(search(items, 'setup letter').map(i => i.id)).toEqual(['a:1'])
    expect(search(items, 'sizing').map(i => i.id)).toEqual(['v:1'])
  })

  it('$NVDA matches only the Tickers field; NVDA also matches text', () => {
    expect(search(items, '$NVDA').map(i => i.id)).toEqual(['v:1'])
    expect(search(items, 'nvda').map(i => i.id)).toEqual(['v:1', 'a:1'])
  })

  it('tag and kind narrow the results', () => {
    expect(results(items, { query: '', tag: 'risk management', kind: 'all' }).map(i => i.id)).toEqual(['v:2'])
    expect(results(items, { query: '', tag: null, kind: 'article' }).map(i => i.id)).toEqual(['a:1'])
  })
})

describe('formatting', () => {
  it('today shows the time; earlier shows M/D/YY and the time, never a weekday', () => {
    const now = new Date(2026, 10, 19, 15, 0)
    expect(formatLibraryTime(new Date(2026, 10, 19, 8, 0).toISOString(), now)).toBe('08:00')
    expect(formatLibraryTime(new Date(2026, 10, 7, 8, 0).toISOString(), now)).toBe('11/7/26 08:00')
    expect(formatLibraryTime(new Date(2026, 10, 13, 17, 52).toISOString(), now)).toBe('11/13/26 17:52')
  })

  it('embeds from youtube.com so a Premium sign-in carries over', () => {
    expect(embedUrl('dQw4w9WgXcQ')).toMatch(/^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\?/)
  })

  it('strips Markdown from a rich-text summary', () => {
    expect(plainSummary('## Key points\n- **Size** down\n- see [the post](https://x.com)')).toBe('Key points\n• Size down\n• see the post')
  })
})
