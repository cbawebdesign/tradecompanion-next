"use client"

import { useStore } from '@/store/useStore'
import { AlertBar } from '@/components/AlertBar'
import { Watchlist } from '@/components/Watchlist'
import { AlertsPage } from '@/components/AlertsPage'
import { SettingsPage } from '@/components/SettingsPage'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { clsx } from 'clsx'

const TABS = [
  { id: 0, label: 'Home', icon: '🏠' },
  { id: 1, label: 'Alerts', icon: '🔔' },
  { id: 2, label: 'Watchlist', icon: '👁️' },
  { id: 3, label: 'Settings', icon: '⚙️' },
]

export default function Home() {
  const { activeTab, setActiveTab, config } = useStore()

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-blue-400">Trade Companion</h1>
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

      {/* Alert Bar - always visible */}
      <AlertBar />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 0 && <HomePage />}
        {activeTab === 1 && <AlertsPage />}
        {activeTab === 2 && <Watchlist />}
        {activeTab === 3 && <SettingsPage />}
      </main>

      {/* Keyboard shortcuts hint */}
      <footer className="px-4 py-1 text-xs text-gray-500 bg-gray-800 border-t border-gray-700">
        <kbd>PageUp</kbd>/<kbd>PageDown</kbd> switch tabs • <kbd>↑</kbd>/<kbd>↓</kbd> navigate • <kbd>Space</kbd> flag symbol
      </footer>
    </div>
  )
}

function HomePage() {
  const { config } = useStore()

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Welcome to Trade Companion</h2>
      <div className="bg-gray-800 rounded-lg p-4 max-w-md">
        <h3 className="text-lg font-semibold mb-2">Quick Info</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-400">Version</dt>
            <dd>2.0.0 (Next.js)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">Hub URL</dt>
            <dd className="text-blue-400 truncate max-w-[200px]">{config.hubUrl || 'Not set'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">API Key</dt>
            <dd>{config.apiKey ? '••••••••' : 'Not set'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 text-gray-400 text-sm">
        <p>Go to <strong>Settings</strong> to configure your API key and hub URL.</p>
        <p className="mt-2">Use <strong>Watchlist</strong> to manage symbols and set price alerts.</p>
      </div>
    </div>
  )
}
