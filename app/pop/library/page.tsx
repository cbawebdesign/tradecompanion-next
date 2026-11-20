"use client"

import { LibraryPage } from '@/components/LibraryPage'

// The whole Library in its own window (spec section 8). Same login state as
// the main window, so saves, cleared items and toolbar tags stay in sync.
export default function PopLibrary() {
  return (
    <div className="h-screen">
      <LibraryPage isPopout />
    </div>
  )
}
