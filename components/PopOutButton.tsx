"use client"

import { useCallback } from 'react'

interface PopOutButtonProps {
  route: string
  title: string
  width?: number
  height?: number
  className?: string
}

export function PopOutButton({ route, title, width = 800, height = 600, className = '' }: PopOutButtonProps) {
  const handlePopOut = useCallback(() => {
    const left = window.screenX + 50
    const top = window.screenY + 50

    const popup = window.open(
      route,
      `popout-${route.replace(/\//g, '-')}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    )

    if (popup) {
      popup.focus()
    }
  }, [route, width, height])

  return (
    <button
      onClick={handlePopOut}
      className={`text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 text-sm ${className}`}
      title={`Pop out ${title}`}
    >
      ⧉
    </button>
  )
}
