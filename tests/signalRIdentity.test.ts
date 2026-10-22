import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/**
 * The SignalR connection identity has to match the identity a personal webhook
 * key is registered against, or Clients.User targets a user nobody is connected
 * as and the alert reaches no one.
 *
 * config.userKey is the TC login username, set by LoginGate. Asserted at the
 * source level because the helper lives inside a React hook module.
 */
const src = readFileSync(new URL('../hooks/useSignalR.ts', import.meta.url), 'utf8')

describe('signalRUserId', () => {
  it('negotiate is called with the derived identity, never tradingViewId directly', () => {
    const calls = src.split('\n').filter(l => l.includes('await negotiate('))
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c).toContain('signalRUserId(config)')
    // the old binding must be gone everywhere
    expect(src).not.toContain("config.tradingViewId || 'anonymous'")
  })

  it('prefers userKey, falls back to tradingViewId, then anonymous', () => {
    const fn = src.slice(src.indexOf('function signalRUserId'), src.indexOf('async function negotiate'))
    expect(fn).toContain('cfg.userKey')
    expect(fn).toContain('cfg.tradingViewId')
    expect(fn).toContain("'anonymous'")
    // userKey must be normalised the same way LoginGate stores it
    expect(fn).toContain('toLowerCase()')
  })

  it('LoginGate still stores userKey as the lowercased username', () => {
    const lg = readFileSync(new URL('../components/LoginGate.tsx', import.meta.url), 'utf8')
    expect(lg).toContain('updateConfig({ userKey: uname })')
    expect(lg).toMatch(/username\.trim\(\)\.toLowerCase\(\)/)
  })
})
