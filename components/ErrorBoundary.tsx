"use client"

import React from 'react'

// Catches React render/lifecycle errors AND global window errors (async rejections,
// uncaught throws). On first error per session: auto-files a bug in the intake
// system with stack trace + context, then shows a minimal recovery screen.
//
// Dedups via sessionStorage so we don't flood the bug tracker when a broken
// component re-throws on every render.

const AZURE_API = 'https://tradecompanion3.azurewebsites.net/api'
const SESSION_KEY = 'tc-crash-reported'

interface State {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

interface Props {
  children: React.ReactNode
}

async function reportCrash(
  kind: 'render' | 'window-error' | 'unhandled-rejection',
  message: string,
  stack: string | undefined,
  extra: Record<string, unknown> = {},
) {
  try {
    if (typeof window === 'undefined') return
    // One report per session signature — prevents storms from one bad component.
    const sig = `${kind}:${message.slice(0, 80)}`
    const existing = sessionStorage.getItem(SESSION_KEY) || ''
    if (existing.includes(sig)) return
    sessionStorage.setItem(SESSION_KEY, existing + '|' + sig)

    const ua = navigator.userAgent
    const url = window.location.href
    const snapshot = safeStateSnapshot()

    const body = {
      title: `[auto] ${kind}: ${message.slice(0, 90)}`,
      description: [
        `Kind: ${kind}`,
        `Message: ${message}`,
        ``,
        `URL: ${url}`,
        `User agent: ${ua}`,
        `Extra: ${JSON.stringify(extra, null, 2)}`,
        ``,
        `State snapshot:`,
        snapshot,
        ``,
        `Stack:`,
        stack || '(no stack)',
      ].join('\n'),
      severity: 'high',
      status: 'open',
      service: 'UI',
      reportedBy: 'error-boundary',
    }

    await fetch(`${AZURE_API}/tcadmin/bugs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Silent — don't let crash reporting itself crash.
  }
}

// Pulls a small, safe summary of state without dragging in the full Zustand store
// (which would couple ErrorBoundary to store internals and could itself throw).
function safeStateSnapshot(): string {
  try {
    if (typeof window === 'undefined') return '(no window)'
    const raw = window.localStorage.getItem('trade-companion-storage')
    if (!raw) return '(no persisted state)'
    const parsed = JSON.parse(raw)
    const wl = parsed?.state?.watchlists
    const flagged = parsed?.state?.flaggedSymbols
    return JSON.stringify({
      watchlistCount: Array.isArray(wl) ? wl.length : null,
      totalSymbols: Array.isArray(wl) ? wl.reduce((s: number, w: any) => s + (w?.symbols?.length ?? 0), 0) : null,
      flaggedCount: Array.isArray(flagged) ? flagged.length : null,
      hasUserKey: !!parsed?.state?.config?.userKey,
      hubUrl: parsed?.state?.config?.hubUrl,
    })
  } catch {
    return '(snapshot failed)'
  }
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    void reportCrash('render', error.message, error.stack, {
      componentStack: errorInfo.componentStack,
    })
  }

  componentDidMount() {
    if (typeof window === 'undefined') return
    window.addEventListener('error', this.onWindowError)
    window.addEventListener('unhandledrejection', this.onUnhandledRejection)
  }

  componentWillUnmount() {
    if (typeof window === 'undefined') return
    window.removeEventListener('error', this.onWindowError)
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection)
  }

  onWindowError = (e: ErrorEvent) => {
    void reportCrash('window-error', e.message || 'window error', e.error?.stack, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    })
  }

  onUnhandledRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    void reportCrash('unhandled-rejection', message, stack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0a0e17',
          color: '#f3f4f6',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          <div style={{ maxWidth: 560, textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Something broke</h1>
            <p style={{ color: '#9ca3af', marginBottom: 16 }}>
              A crash was auto-reported. Your watchlists and notes are safe in the cloud — reloading should bring the app back.
            </p>
            <pre style={{
              textAlign: 'left',
              background: '#111827',
              padding: 12,
              borderRadius: 6,
              fontSize: 11,
              color: '#f87171',
              maxHeight: 200,
              overflow: 'auto',
              marginBottom: 16,
            }}>
              {this.state.error.message}
            </pre>
            <button
              onClick={() => { window.location.reload() }}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 0,
                padding: '10px 20px',
                borderRadius: 6,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
