"use client"

import { useEffect } from 'react'
import { PnlBox } from '@/components/PnlBox'

export default function PnlPopOut() {
  useEffect(() => {
    document.title = 'Fidelity Investments'
  }, [])

  return (
    <div style={{ background: '#1c1c1c', minHeight: '100vh' }}>
      <PnlBox />
    </div>
  )
}
