"use client"

import { PopoutProviders } from './providers'
import '../globals.css'

// Minimal layout for pop-out windows
// Uses PopoutProviders which only runs SignalR + cross-window sync
// Does NOT run polling hooks (to avoid duplicate alerts)
export default function PopLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-900 text-gray-100 h-screen overflow-hidden">
        <PopoutProviders>
          {children}
        </PopoutProviders>
      </body>
    </html>
  )
}
