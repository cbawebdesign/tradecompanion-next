"use client"

import { Watchlist } from '@/components/Watchlist'

export default function PopWatchlist() {
  return (
    <div className="h-screen">
      <Watchlist isPopout />
    </div>
  )
}
