"use client"

import { PopoutProviders } from './providers'
import '../globals.css'

// Detect Electron for transparent background
const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)

// Minimal layout for pop-out windows
// Uses PopoutProviders which only runs SignalR + cross-window sync
// Does NOT run polling hooks (to avoid duplicate alerts)
export default function PopLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="blue" style={isElectron ? { background: 'transparent' } : undefined}>
      <body
        className="h-screen overflow-hidden"
        style={{
          background: isElectron ? 'transparent' : 'var(--bg-base)',
          color: 'var(--text-primary)',
        }}
      >
        <PopoutProviders>
          {children}
        </PopoutProviders>
      </body>
    </html>
  )
}
