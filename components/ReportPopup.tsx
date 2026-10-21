"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { planEmbed } from '@/lib/embeddableUrl'
import { useLinkViewer } from '@/lib/linkViewer'

/**
 * In-app viewer for any URL TC wants to show — Airtable reports, SEC filings,
 * press releases, catalyst PRs, YouTube, Substack.
 *
 * Justin (Data Ribbon 2.0): "Instead of opening a URL in a new window, can you
 * display the URL in a pop up window within TC? … the user should be able to
 * hit ESC on the keyboard to close out the pop window or click an X button with
 * the mouse in the top right… In the popup the user should be able to click any
 * url's in the pop up note as well as select text to copy and paste."
 *
 * Sizing is percentage-only, per his touch-up note: "can you set the pop up box
 * to use a percentage of the available margins instead of a fixed size … 90% -
 * 95% of the width of the TC app". It used to be min(1100px, 92vw) — on a wide
 * window the 1100px cap won and the panel stranded itself in the middle, which
 * is the screenshot he sent.
 *
 * An iframe gives selection and working links for free, but only where the
 * target allows framing; lib/embeddableUrl decides that and rewrites YouTube to
 * its embed player. A site that blocks framing renders as a blank white box
 * with no error, which looks like TC is broken, so there is both a timeout
 * fallback and an always-visible "open in a new tab" escape hatch.
 */
export function ReportPopup({
  url,
  title,
  onClose,
  allowOpenInTab = true,
}: {
  url: string
  title: string
  onClose: () => void
  /** See LinkViewerState.allowOpenInTab — off for the research buttons. */
  allowOpenInTab?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [mounted, setMounted] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const plan = useMemo(() => planEmbed(url), [url])

  useEffect(() => setMounted(true), [])

  // ESC closes. Captured at the document so it works wherever focus sits,
  // including inside the iframe's chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Links clicked INSIDE a proxied page open a real browser window.
  //
  // Justin: "from here if I click any of these URL's in the pop up window, I
  // get an error … from the popup, any other URL's open in a new browser
  // window?"
  //
  // /api/embed injects a click handler that forwards the URL here rather than
  // relying on target="_blank", which Electron denies from inside a frame. TC's
  // own window.open does work in his build — the pop-out buttons use it.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null
      if (!data || data.type !== 'tc-open-url' || typeof data.url !== 'string') return
      // The frame is sandboxed to an opaque origin, so the sender cannot be
      // checked by origin. Validate the payload instead: only ever a web URL,
      // and opening a new tab is the only effect.
      if (!/^https?:\/\//i.test(data.url)) return
      window.open(data.url, '_blank', 'noopener,noreferrer')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // A framed page that never fires onLoad is almost always one refusing to be
  // embedded. 3s rather than the original 6 — a page that has not started in
  // three seconds is not going to feel usable anyway, and the fallback is one
  // click from the real thing.
  useEffect(() => {
    if (!plan.src) return
    setLoaded(false)
    setTimedOut(false)
    const t = window.setTimeout(() => setTimedOut(true), 3000)
    return () => window.clearTimeout(t)
  }, [plan.src])

  if (!mounted) return null

  const showFallback = !plan.src || (timedOut && !loaded)

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.6)' }}
      // Clicking the backdrop closes; clicks inside the panel must not, or
      // selecting text would dismiss the thing you are reading.
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-lg flex flex-col overflow-hidden"
        // Percentage of the window, no px cap — scales with however Justin has
        // sized TC.
        style={{ width: '94vw', height: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-3 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-glass)' }}
        >
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
            {title}
          </span>
          <div className="flex items-center gap-3 flex-shrink-0 pl-3">
            {allowOpenInTab && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-xs hover:underline"
                style={{ color: 'var(--text-muted)' }}
                onClick={(e) => e.stopPropagation()}
              >
                open in tab
              </a>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-xl leading-none px-1"
              style={{ color: 'var(--text-muted)' }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 relative" style={{ background: plan.src ? '#fff' : 'transparent' }}>
          {showFallback ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
                 style={{ background: 'var(--bg-glass)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                This page will not display inside TC.
              </span>
              <span className="text-xs max-w-md" style={{ color: 'var(--text-muted)' }}>
                {plan.reason || 'The site refuses to be embedded. Nothing is wrong with the link.'}
              </span>
              {allowOpenInTab ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded text-sm"
                  style={{ background: 'var(--accent-primary)', color: '#fff' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Open in a new tab
                </a>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  This report is only viewable inside TC.
                </span>
              )}
            </div>
          ) : null}
          {plan.src && (
            <iframe
              ref={frameRef}
              src={plan.src}
              title={title}
              onLoad={() => setLoaded(true)}
              className="w-full h-full"
              style={{ border: 0 }}
              /* Two different sandboxes on purpose.

                 Proxied pages are served from /api/embed, which means they run
                 under TC's OWN origin. Granting allow-same-origin there would
                 let a report read TC's localStorage and issue same-origin
                 requests, so it is withheld and the frame gets an opaque
                 origin instead. allow-popups-to-escape-sandbox is then
                 required, or the window a link opens would inherit the
                 sandbox and the target site would load crippled.

                 Direct cross-origin frames are already isolated by the browser
                 and need allow-same-origin to behave normally. */
              sandbox={
                plan.proxied
                  ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'
                  : 'allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation'
              }
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            />
          )}
        </div>

        <div className="px-3 py-1 text-[10px] flex-shrink-0 flex items-center gap-2"
             style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)' }}>
          <span>ESC or × to close</span>
          {/* Always reachable. Some sites fire onLoad for their own block page,
              so the timeout above cannot catch every blank panel. */}
          {plan.src && allowOpenInTab && (
            <>
              <span>·</span>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
                style={{ color: 'var(--text-muted)' }}
                onClick={(e) => e.stopPropagation()}
              >
                page blank? open in a new tab
              </a>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Window-level mount. Renders whatever the shared link viewer currently holds,
 * so any call site can just call openInViewer(url, title).
 */
export function LinkViewer() {
  const url = useLinkViewer((s) => s.url)
  const title = useLinkViewer((s) => s.title)
  const allowOpenInTab = useLinkViewer((s) => s.allowOpenInTab)
  const close = useLinkViewer((s) => s.close)
  if (!url) return null
  return <ReportPopup url={url} title={title} onClose={close} allowOpenInTab={allowOpenInTab} />
}
