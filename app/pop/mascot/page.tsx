"use client"

import { AlertMascot } from '@/components/AlertMascot'

// Detect Electron — its userAgent contains "Electron"
const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)

// Pop-out mascot window — mascot pinned to bottom, speech bubble floats above
// In Electron: fully transparent background so mascot floats on desktop
export default function PopMascot() {
  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-end pb-1"
      style={{ background: isElectron ? 'transparent' : 'var(--bg-base)' }}
    >
      <AlertMascot isPopout />
    </div>
  )
}
