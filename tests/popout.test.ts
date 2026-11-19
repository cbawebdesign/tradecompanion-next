import { describe, it, expect, afterEach } from 'vitest'
import { isPopoutWindow } from '../lib/popout'
import { handleAlertAudio } from '../lib/alertAudio'

const g = globalThis as any
const at = (pathname: string) => { g.window = { location: { pathname } } }

describe('pop-out windows', () => {
  afterEach(() => { delete g.window; delete g.speechSynthesis })

  it('are the /pop/* routes only', () => {
    at('/pop/alertbar'); expect(isPopoutWindow()).toBe(true)
    at('/pop/mascot'); expect(isPopoutWindow()).toBe(true)
    at('/'); expect(isPopoutWindow()).toBe(false)
    at('/popular'); expect(isPopoutWindow()).toBe(false)
    delete g.window; expect(isPopoutWindow()).toBe(false)
  })

  it('stay silent — the main window plays and reads out the alert', () => {
    let spoke = 0
    g.speechSynthesis = { speak: () => { spoke++ }, getVoices: () => [], cancel: () => {} }
    const cfg = { audioEnabled: true, ttsEnabled: true, alertSounds: {} }
    at('/pop/alertbar')
    g.window.speechSynthesis = g.speechSynthesis
    handleAlertAudio('news', 'ARAI news', cfg)
    expect(spoke).toBe(0)
  })
})
