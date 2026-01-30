"use client"

import { AlertBar } from '@/components/AlertBar'

export default function PopAlertBar() {
  return (
    <div className="h-screen">
      <AlertBar isPopout />
    </div>
  )
}
