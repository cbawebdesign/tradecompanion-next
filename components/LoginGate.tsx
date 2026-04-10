"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { proxyUrl } from '@/lib/proxyUrl'

// ── Animated candlestick chart background ──────────────────────────────

function generateCandles(count: number) {
  const candles: { x: number; open: number; close: number; high: number; low: number; green: boolean }[] = []
  let price = 50 + Math.random() * 50
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * 8
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.random() * 4
    const low = Math.min(open, close) - Math.random() * 4
    candles.push({ x: i, open, close, high, low, green: close >= open })
    price = close
  }
  return candles
}

function CandlestickBG() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const candlesRef = useRef(generateCandles(120))
  const offsetRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      const candles = candlesRef.current
      const barW = 12
      const gap = 3
      const totalW = barW + gap
      const visible = Math.ceil(width / totalW) + 2

      offsetRef.current += 0.15
      if (offsetRef.current >= totalW) {
        offsetRef.current -= totalW
        // Shift candles and add new one
        candles.shift()
        const last = candles[candles.length - 1]
        const change = (Math.random() - 0.48) * 8
        const open = last.close
        const close = open + change
        const high = Math.max(open, close) + Math.random() * 4
        const low = Math.min(open, close) - Math.random() * 4
        candles.push({ x: candles.length, open, close, high, low, green: close >= open })
      }

      // Find price range for scaling
      let minP = Infinity, maxP = -Infinity
      for (let i = 0; i < Math.min(visible, candles.length); i++) {
        const c = candles[i]
        if (c.low < minP) minP = c.low
        if (c.high > maxP) maxP = c.high
      }
      const range = maxP - minP || 1
      const padY = height * 0.15
      const chartH = height - padY * 2

      const toY = (p: number) => padY + chartH - ((p - minP) / range) * chartH

      ctx.globalAlpha = 0.06
      for (let i = 0; i < Math.min(visible, candles.length); i++) {
        const c = candles[i]
        const x = i * totalW - offsetRef.current
        const yHigh = toY(c.high)
        const yLow = toY(c.low)
        const yOpen = toY(c.open)
        const yClose = toY(c.close)
        const bodyTop = Math.min(yOpen, yClose)
        const bodyH = Math.max(Math.abs(yOpen - yClose), 1)

        // Wick
        ctx.strokeStyle = c.green ? '#22c55e' : '#ef4444'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + barW / 2, yHigh)
        ctx.lineTo(x + barW / 2, yLow)
        ctx.stroke()

        // Body
        ctx.fillStyle = c.green ? '#22c55e' : '#ef4444'
        ctx.fillRect(x, bodyTop, barW, bodyH)
      }
      ctx.globalAlpha = 1

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}

// ── Scrolling ticker tape ──────────────────────────────────────────────

const TAPE_SYMBOLS = [
  { sym: 'AAPL', price: '189.43', chg: '+1.24%' },
  { sym: 'TSLA', price: '248.91', chg: '-0.87%' },
  { sym: 'NVDA', price: '875.30', chg: '+3.42%' },
  { sym: 'MSFT', price: '420.15', chg: '+0.56%' },
  { sym: 'AMD', price: '167.80', chg: '+2.13%' },
  { sym: 'META', price: '502.60', chg: '-0.34%' },
  { sym: 'GOOG', price: '155.72', chg: '+0.91%' },
  { sym: 'AMZN', price: '186.40', chg: '+1.05%' },
  { sym: 'SPY', price: '512.33', chg: '+0.44%' },
  { sym: 'QQQ', price: '438.90', chg: '+0.78%' },
  { sym: 'PLTR', price: '24.15', chg: '+5.20%' },
  { sym: 'SOFI', price: '9.87', chg: '-1.45%' },
]

function TickerTape() {
  return (
    <div className="fixed top-0 left-0 right-0 overflow-hidden" style={{ zIndex: 1 }}>
      <div className="ticker-tape-track flex whitespace-nowrap py-2" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
        {[...TAPE_SYMBOLS, ...TAPE_SYMBOLS, ...TAPE_SYMBOLS].map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-4 text-xs font-mono">
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{t.sym}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{t.price}</span>
            <span style={{ color: t.chg.startsWith('+') ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{t.chg}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Floating price particles ───────────────────────────────────────────

function PriceParticles() {
  const particles = useRef(
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      y: 10 + Math.random() * 80,
      price: (Math.random() * 500 + 10).toFixed(2),
      green: Math.random() > 0.4,
      delay: Math.random() * 8,
      duration: 12 + Math.random() * 10,
    }))
  ).current

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute text-xs font-mono font-bold floating-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            color: p.green ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            fontSize: '11px',
          }}
        >
          ${p.price}
        </div>
      ))}
    </div>
  )
}

// ── Session helpers ────────────────────────────────────────────────────

const SESSION_KEY = 'tc_session'

interface TCSession {
  username: string
  displayName: string
  loginTime: number
}

export function getSession(): TCSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY)
  }
}

function saveSession(session: TCSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

// ── Main LoginGate ─────────────────────────────────────────────────────

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null) // null = checking
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const hubUrl = useStore((s) => s.config.hubUrl)
  const updateConfig = useStore((s) => s.updateConfig)
  const setWatchlists = useStore((s) => s.setWatchlists)

  const baseApi = hubUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api'

  // Check existing session on mount
  useEffect(() => {
    const session = getSession()
    if (session) {
      setAuthed(true)
    } else {
      setAuthed(false)
      // Stagger the form entrance animation
      setTimeout(() => setShowForm(true), 300)
    }
  }, [])

  // Pull watchlists from server after login
  const pullUserData = useCallback(async (userKey: string) => {
    try {
      const resp = await fetch(proxyUrl(`${baseApi}/user/${encodeURIComponent(userKey)}`))
      if (!resp.ok) return
      const userData = await resp.json()
      if (userData.watchlists && Object.keys(userData.watchlists).length > 0) {
        const restored = Object.entries(userData.watchlists).map(([name, symbols]: [string, any]) => ({
          id: crypto.randomUUID(),
          name,
          symbols: (symbols as string[]).map((sym: string) => ({
            symbol: sym,
            upperAlert: null,
            lowerAlert: null,
            notes: '',
          })),
        }))
        setWatchlists(restored)
      }
    } catch (err) {
      console.warn('Failed to pull user data on login:', err)
    }
  }, [baseApi, setWatchlists])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Retry logic for transient 503s (Azure Function cold starts / restarts)
      const MAX_RETRIES = 3
      const RETRY_DELAY = 2000
      let resp: Response | undefined
      let lastStatus = 0

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 12000)

        try {
          resp = await fetch(proxyUrl(`${baseApi}/tcadmin/login`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: username.trim().toLowerCase(),
              password,
            }),
            signal: controller.signal,
          })
        } catch (fetchErr: any) {
          clearTimeout(timeout)
          if (fetchErr.name === 'AbortError') {
            setError('Login timed out. Server may be waking up — try again.')
            setLoading(false)
            return
          }
          throw fetchErr
        }
        clearTimeout(timeout)
        lastStatus = resp.status

        // 503 = Azure Function unavailable — retry after delay
        if (resp.status === 503 && attempt < MAX_RETRIES) {
          console.log(`Login: 503, retrying (${attempt}/${MAX_RETRIES})...`)
          await new Promise(r => setTimeout(r, RETRY_DELAY))
          continue
        }
        break
      }

      if (!resp || !resp.ok) {
        if (lastStatus === 401) {
          setError('Invalid username or password.')
        } else if (lastStatus === 503) {
          setError('Server is temporarily unavailable. Try again in a minute.')
        } else {
          setError(`Server error (${lastStatus}). Try again.`)
        }
        setLoading(false)
        return
      }

      const data = await resp.json()
      const uname = data.username || username.trim().toLowerCase()

      // Save session
      saveSession({
        username: uname,
        displayName: data.displayName || uname,
        loginTime: Date.now(),
      })

      // Set userKey to username so notes, sync, etc. all use login identity
      updateConfig({ userKey: uname })

      // Auto-pull watchlists/settings from server
      await pullUserData(uname)

      setAuthed(true)
    } catch (err: any) {
      setError('Network error. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [username, password, baseApi, updateConfig, pullUserData])

  // Still checking session
  if (authed === null) return null

  // Authenticated — render app
  if (authed) return <>{children}</>

  // ── Login UI ─────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <CandlestickBG />
      <TickerTape />
      <PriceParticles />

      {/* Centered card */}
      <div
        className={`relative z-10 w-full max-w-[420px] mx-4 login-card ${showForm ? 'login-card-visible' : ''}`}
      >
        {/* Glow ring behind card */}
        <div className="absolute -inset-[2px] rounded-2xl opacity-40 blur-sm" style={{
          background: `linear-gradient(135deg, var(--accent-primary), transparent 40%, transparent 60%, var(--alert-green))`,
        }} />

        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--border-glass)',
            boxShadow: '0 25px 60px var(--shadow-color)',
          }}
        >
          {/* Header section */}
          <div className="px-8 pt-8 pb-4 text-center">
            {/* Animated logo mark */}
            <div className="inline-flex items-center justify-center mb-5">
              <div className="relative">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center logo-pulse"
                  style={{
                    background: `linear-gradient(135deg, var(--accent-primary), rgba(34,197,94,0.8))`,
                    boxShadow: '0 0 30px var(--accent-glow)',
                  }}
                >
                  {/* Candlestick icon */}
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="10" width="4" height="12" rx="1" fill="white" opacity="0.9" />
                    <line x1="8" y1="6" x2="8" y2="10" stroke="white" strokeWidth="1.5" opacity="0.7" />
                    <line x1="8" y1="22" x2="8" y2="26" stroke="white" strokeWidth="1.5" opacity="0.7" />
                    <rect x="14" y="8" width="4" height="14" rx="1" fill="white" opacity="0.9" />
                    <line x1="16" y1="4" x2="16" y2="8" stroke="white" strokeWidth="1.5" opacity="0.7" />
                    <line x1="16" y1="22" x2="16" y2="28" stroke="white" strokeWidth="1.5" opacity="0.7" />
                    <rect x="22" y="12" width="4" height="10" rx="1" fill="white" opacity="0.9" />
                    <line x1="24" y1="8" x2="24" y2="12" stroke="white" strokeWidth="1.5" opacity="0.7" />
                    <line x1="24" y1="22" x2="24" y2="25" stroke="white" strokeWidth="1.5" opacity="0.7" />
                  </svg>
                </div>
                {/* Orbiting dot */}
                <div className="absolute inset-0 orbit-ring">
                  <div
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      background: 'var(--alert-green)',
                      boxShadow: '0 0 8px rgba(34,197,94,0.8)',
                      top: '-4px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }}
                  />
                </div>
              </div>
            </div>

            <h1
              className="text-2xl font-bold tracking-tight mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Trade Companion
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Real-time alerts & market intelligence
            </p>
          </div>

          {/* Divider with pulse */}
          <div className="px-8">
            <div className="h-px relative overflow-hidden" style={{ background: 'var(--border-glass)' }}>
              <div className="divider-pulse absolute inset-y-0 w-20" style={{
                background: `linear-gradient(90deg, transparent, var(--accent-primary), transparent)`,
              }} />
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pt-6 pb-8 space-y-5">
            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm login-shake"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#fca5a5',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </svg>
                {error}
              </div>
            )}

            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="Enter username"
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all duration-200 login-input"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter password"
                  className="w-full px-4 py-3 pr-12 rounded-lg text-sm outline-none transition-all duration-200 login-input"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 login-btn"
              style={{
                background: loading
                  ? 'var(--bg-tertiary)'
                  : `linear-gradient(135deg, var(--accent-primary), rgba(34,197,94,0.9))`,
                color: '#fff',
                boxShadow: loading ? 'none' : '0 4px 20px var(--accent-glow)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Powered by Trade Companion &middot; Secured Connection
            </p>
          </div>
        </div>
      </div>

      {/* Bottom ticker tape */}
      <div className="fixed bottom-0 left-0 right-0 overflow-hidden" style={{ zIndex: 1 }}>
        <div
          className="ticker-tape-track-reverse flex whitespace-nowrap py-2"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
        >
          {[...TAPE_SYMBOLS, ...TAPE_SYMBOLS, ...TAPE_SYMBOLS].map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-4 text-xs font-mono">
              <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{t.sym}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{t.price}</span>
              <span style={{ color: t.chg.startsWith('+') ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{t.chg}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
