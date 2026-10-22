import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tvBackfillIdentities, SYSTEM_WEBHOOK_USER } from '../lib/tvBackfillIdentities'

describe('tvBackfillIdentities', () => {
  it('asks for the same identity the live socket binds to', () => {
    // The whole bug: live delivery used userKey, backfill used tradingViewId.
    expect(tvBackfillIdentities({ userKey: 'Justin2' })).toContain('justin2')
  })

  it('always includes the system webhook bucket', () => {
    // 14 system alerts existed since the previous close on 2026-10-22 and no
    // reload could recover any of them.
    expect(tvBackfillIdentities({ userKey: 'justin2' })).toContain(SYSTEM_WEBHOOK_USER)
    expect(tvBackfillIdentities({})).toContain(SYSTEM_WEBHOOK_USER)
  })

  it('still asks for a legacy tradingViewId that differs from the login', () => {
    const ids = tvBackfillIdentities({ userKey: 'justin2', tradingViewId: 'jd-legacy' })
    expect(ids).toEqual(['justin2', 'jd-legacy', SYSTEM_WEBHOOK_USER])
  })

  it('does not ask twice when they are the same string', () => {
    expect(tvBackfillIdentities({ userKey: 'justin2', tradingViewId: 'justin2' }))
      .toEqual(['justin2', SYSTEM_WEBHOOK_USER])
  })

  it('keeps both spellings when case differs — partition keys are case-sensitive', () => {
    expect(tvBackfillIdentities({ userKey: 'justin2', tradingViewId: 'Justin2' }))
      .toEqual(['justin2', 'Justin2', SYSTEM_WEBHOOK_USER])
  })

  it('never asks for the anonymous bucket', () => {
    // signalRUserId falls back to 'anonymous'; that is a bucket, not a person.
    expect(tvBackfillIdentities({})).not.toContain('anonymous')
    expect(tvBackfillIdentities({ userKey: '  ', tradingViewId: '' })).toEqual([SYSTEM_WEBHOOK_USER])
  })

  it('the backfill runs without a tradingViewId', () => {
    // The old guard was `if (!cfg.tradingViewId) return`, so a logged-in user
    // who had never filled that Settings box got no backfill of any kind.
    const src = readFileSync(join(__dirname, '..', 'hooks', 'useSignalR.ts'), 'utf8')
    expect(src).not.toContain('if (!cfg.tradingViewId || isLocalHub) return')
    expect(src).toContain('tvBackfillIdentities')
  })
})
