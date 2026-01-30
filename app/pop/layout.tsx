import { PopoutProviders } from './providers'
import '../globals.css'

export const metadata = {
  title: 'Trade Companion',
}

// Minimal layout for pop-out windows
// Uses PopoutProviders which only syncs state + receives quotes
// Does NOT run SignalR or polling hooks (those run only in main window)
export default function PopLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="blue">
      <body className="h-screen overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
        <PopoutProviders>
          {children}
        </PopoutProviders>
      </body>
    </html>
  )
}
