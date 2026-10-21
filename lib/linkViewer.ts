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
  /**
   * Whether the popup offers an "open in tab" escape hatch.
   *
   * Justin (10/21): "On the existing Dilution, Resistance, China & Catalysts
   * buttons, please disable 'Open in Tab' on the pop up window. I want this
   * info to be exclusive to TC and make it hard for people to locate and share
   * the URL to other people outside of TC."
   *
   * Default stays true: for an SEC filing or a press release the escape hatch
   * is the only thing standing between the user and a blank panel when the
   * site refuses to be framed. It is turned off only for his research pages,
   * which are known to frame.
   */
  allowOpenInTab: boolean
  open: (url: string, title?: string, opts?: { allowOpenInTab?: boolean }) => void
  close: () => void
}

export const useLinkViewer = create<LinkViewerState>((set) => ({
  url: null,
  title: '',
  allowOpenInTab: true,
  open: (url, title = '', opts) =>
    set({ url, title, allowOpenInTab: opts?.allowOpenInTab !== false }),
  close: () => set({ url: null, title: '', allowOpenInTab: true }),
}))

/** Imperative entry point for click handlers that aren't already subscribed. */
export function openInViewer(url: string, title = '', opts?: { allowOpenInTab?: boolean }) {
  if (!url) return
  useLinkViewer.getState().open(url, title, opts)
}
