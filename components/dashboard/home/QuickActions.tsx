'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface Props {
  professionalId: string
  isPaused: boolean
}

export function QuickActions({ professionalId, isPaused }: Props) {
  const router = useRouter()
  const [confirmPause, setConfirmPause] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleTogglePause() {
    setLoading(true)
    try {
      await fetch('/api/dashboard/lara/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professional_id: professionalId, paused: !isPaused }),
      })
      router.refresh()
    } finally {
      setLoading(false)
      setConfirmPause(false)
    }
  }

  const actions = [
    {
      icon: '🚫',
      label: 'Bloquear horário',
      href: '/dashboard/agenda?action=block',
      onClick: undefined,
    },
    {
      icon: isPaused ? '▶️' : '⏸️',
      label: isPaused ? 'Retomar Lara' : 'Pausar Lara',
      href: undefined,
      onClick: () => setConfirmPause(true),
    },
    {
      icon: '💬',
      label: 'Ver pendentes',
      href: '/dashboard/conversations?filter=pending',
      onClick: undefined,
    },
  ]

  return (
    <>
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        {actions.map(action => {
          const inner = (
            <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-white shadow-sm active:opacity-70">
              <span className="text-2xl" aria-hidden="true">{action.icon}</span>
              <span className="text-[10px] font-medium text-gray-600 text-center leading-tight px-1">
                {action.label}
              </span>
            </div>
          )

          return action.href ? (
            <Link key={action.label} href={action.href}>{inner}</Link>
          ) : (
            <button key={action.label} onClick={action.onClick} className="text-left">
              {inner}
            </button>
          )
        })}
      </div>

      <ConfirmDialog
        isOpen={confirmPause}
        onClose={() => setConfirmPause(false)}
        onConfirm={handleTogglePause}
        title={isPaused ? 'Retomar Lara' : 'Pausar Lara'}
        description={
          isPaused
            ? 'A Lara voltará a responder suas clientes normalmente.'
            : 'A Lara deixará de responder automaticamente. Você pode retomar a qualquer momento.'
        }
        confirmLabel={isPaused ? 'Retomar' : 'Pausar'}
        loading={loading}
      />
    </>
  )
}
