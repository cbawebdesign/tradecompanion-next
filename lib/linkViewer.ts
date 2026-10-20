import { create } from 'zustand'

/**
 * One in-app link viewer per window.
 *
 * Justin (touch-up notes): "please open ALL url's that are opened within TC to
 * appear in the pop up window instead of a New Browser window. This would
 * include substack, youtube, press releases, SEC filings, catalyst PR's, and
 * URL pulled from one of the airtable databases, basically everything."
 *
 * Deliberately NOT part of useStore: that store is persisted, and a half-open
 * viewer has no business surviving a reload. Deliberately a store rather than a
 * prop chain because the call sites are spread across the timeline, the
 * watchlist, the alerts page and the ribbon.
 *
 * Each pop-out window (app/pop/*) is its own document with its own module
 * instance, so the viewer opens in the window that was clicked — which is what
 * you want when the timeline is popped out onto a second monitor.
 */
interface LinkViewerState {
  url: string | null
  title: string
  open: (url: string, title?: string) => void
  close: () => void
}

export const useLinkViewer = create<LinkViewerState>((set) => ({
  url: null,
  title: '',
  open: (url, title = '') => set({ url, title }),
  close: () => set({ url: null, title: '' }),
}))

/** Imperative entry point for click handlers that aren't already subscribed. */
export function openInViewer(url: string, title = '') {
  if (!url) return
  useLinkViewer.getState().open(url, title)
}
