"use client"

import { useStore } from '@/store/useStore'
import { AlertBar } from '@/components/AlertBar'
import { Watchlist } from '@/components/Watchlist'
import { AlertsPage } from '@/components/AlertsPage'
import { ScannerPage } from '@/components/ScannerPage'
import { SettingsPage } from '@/components/SettingsPage'
import { AdminPage } from '@/components/AdminPage'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { ChartPanel } from '@/components/ChartPanel'
import { AlertMascot } from '@/components/AlertMascot'
import { clsx } from 'clsx'

const TABS = [
  { id: 0, label: 'Home', icon: '🏠' },
  { id: 1, label: 'Alerts', icon: '🔔' },
  { id: 2, label: 'Watchlist', icon: '📋' },
  { id: 3, label: 'Scanner', icon: '📊' },
  { id: 4, label: 'Admin', icon: '🔧' },
  { id: 5, label: 'Settings', icon: '⚙️' },
]

export default function Home() {
  const { activeTab, setActiveTab, setActivePane, toggleChartMode, selectedSymbol } = useStore()

  // Clear pane focus when clicking on header/tabs
  const handleHeaderClick = () => {
    setActivePane(null)
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-2 glass-header"
        onClick={handleHeaderClick}
      >
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold" style={{ color: 'var(--accent-primary)' }}>Trade Companion</h1>
          <ConnectionStatus />
        </div>

        {/* Tabs */}
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'tab',
                activeTab === tab.id && 'active'
              )}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 0 && <HomePage />}
        {activeTab === 1 && <AlertsPage />}
        {activeTab === 2 && <Watchlist />}
        {activeTab === 3 && <ScannerPage />}
        {activeTab === 4 && <AdminPage />}
        {activeTab === 5 && <SettingsPage />}
      </main>

      {/* Alert Bar - at bottom */}
      <AlertBar />

      {/* Floating Chart Panel */}
      <ChartPanel />

      {/* Floating Alert Mascot */}
      <AlertMascot />

      {/* Floating Chart Button (FAB) */}
      <button
        onClick={toggleChartMode}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105"
        style={{
          background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--bg-tertiary) 100%)',
          boxShadow: '0 4px 20px var(--accent-glow)',
          border: '1px solid var(--border-glass)'
        }}
        title={selectedSymbol ? `Open chart for ${selectedSymbol}` : 'Open chart'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {selectedSymbol || 'Chart'}
        </span>
      </button>

      {/* Keyboard shortcuts hint */}
      <footer
        className="px-4 py-1 text-xs flex-shrink-0 glass-header"
        style={{ color: 'var(--text-muted)' }}
        onClick={handleHeaderClick}
      >
        <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-glass)' }}>PageUp</kbd>/<kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-glass)' }}>PageDown</kbd> switch tabs • <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-glass)' }}>↑</kbd>/<kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-glass)' }}>↓</kbd> navigate • <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-glass)' }}>Space</kbd> flag symbol
      </footer>
    </div>
  )
}

function HomePage() {
  const { config } = useStore()

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Welcome to Trade Companion</h2>
      <div className="glass-panel rounded-lg p-4 max-w-md">
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Quick Info</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Version</dt>
            <dd style={{ color: 'var(--text-primary)' }}>2.0.0 (Next.js)</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Hub URL</dt>
            <dd className="truncate max-w-[200px]" style={{ color: 'var(--accent-primary)' }}>{config.hubUrl || 'Not set'}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>API Key</dt>
            <dd style={{ color: 'var(--text-primary)' }}>{config.apiKey ? '••••••••' : 'Not set'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <p>Go to <strong style={{ color: 'var(--text-secondary)' }}>Settings</strong> to configure your API key and hub URL.</p>
        <p className="mt-2">Use <strong style={{ color: 'var(--text-secondary)' }}>Watchlist</strong> to manage symbols and set price alerts.</p>
      </div>
    </div>
  )
}
