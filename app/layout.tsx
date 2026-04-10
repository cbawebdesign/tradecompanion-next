import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trade Companion',
  description: 'Real-time trading alerts and watchlist management',
  manifest: '/manifest.json',
  themeColor: '#0a0e17',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Trade Companion',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" data-theme="blue">
      <body className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
