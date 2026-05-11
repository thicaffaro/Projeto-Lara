'use client'

import { useRef, useState } from 'react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
}

const THRESHOLD = 70  // px para acionar refresh

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function onTouchStart(e: React.TouchEvent) {
    if ((containerRef.current?.scrollTop ?? 0) === 0) {
      startY.current = e.touches[0].clientY
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setPulling(Math.min(delta, THRESHOLD * 1.5))
  }

  async function onTouchEnd() {
    if (pulling >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      try { await onRefresh() } finally {
        setRefreshing(false)
      }
    }
    setPulling(0)
    startY.current = null
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-contain"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Indicador pull */}
      {(pulling > 10 || refreshing) && (
        <div
          className="flex items-center justify-center text-xs text-gray-400 transition-all"
          style={{ height: refreshing ? 40 : Math.min(pulling, THRESHOLD) }}
        >
          {refreshing ? '⏳' : pulling >= THRESHOLD ? '↑ Solte para atualizar' : '↓ Puxe para atualizar'}
        </div>
      )}
      {children}
    </div>
  )
}
