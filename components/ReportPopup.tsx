"use client"

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * In-app viewer for a report URL.
 *
 * Justin (Data Ribbon 2.0): "Instead of opening a URL in a new window, can you
 * display the URL in a pop up window within TC? When the popup comes up, the
 * user should be able to hit ESC on the keyboard to close out the pop window or
 * click an X button with the mouse in the top right… In the popup the user
 * should be able to click any url's in the pop up note as well as select text
 * to copy and paste."
 *
 * An iframe gives selection and working links for free, but only if the target
 * allows framing. His here.now pages send no X-Frame-Options and no CSP
 * frame-ancestors, so they embed fine — checked before building this. Anything
 * that does block framing renders as a blank white box with no error, which
 * would look like TC is broken, so a load that does not arrive within a few
 * seconds falls back to an explicit "open in a new tab" panel.
 */
export function ReportPopup({
  url,
  title,
  onClose,
}: {
  url: string
  title: string
  onClose: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [mounted, setMounted] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

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

  // A framed page that never fires onLoad is almost always one refusing to be
  // embedded. Show the fallback rather than a blank panel.
  useEffect(() => {
    const t = window.setTimeout(() => { if (!loaded) setBlocked(true) }, 6000)
    return () => window.clearTimeout(t)
  }, [loaded])

  if (!mounted) return null

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
        style={{ width: 'min(1100px, 92vw)', height: 'min(800px, 88vh)' }}
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

        <div className="flex-1 relative" style={{ background: '#fff' }}>
          {blocked && !loaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
                 style={{ background: 'var(--bg-glass)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                This page will not display inside TC.
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Some sites refuse to be embedded. Nothing is wrong with the report.
              </span>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded text-sm"
                style={{ background: 'var(--accent-primary)', color: '#fff' }}
              >
                Open in a new tab
              </a>
            </div>
          ) : null}
          <iframe
            ref={frameRef}
            src={url}
            title={title}
            onLoad={() => setLoaded(true)}
            className="w-full h-full"
            style={{ border: 0 }}
            // Permits links and text selection while keeping the page from
            // reaching back into TC.
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </div>

        <div className="px-3 py-1 text-[10px] flex-shrink-0"
             style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)' }}>
          ESC or × to close
        </div>
      </div>
    </div>,
    document.body
  )
}
