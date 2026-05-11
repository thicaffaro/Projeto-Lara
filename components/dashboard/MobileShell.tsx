'use client'

import { useEffect, useState } from 'react'

// Push subscription helper (fire-and-forget)
async function savePushSubscription(sub: PushSubscription) {
  try {
    await fetch('/api/dashboard/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
  } catch { /* silencioso — push é complementar ao WhatsApp */ }
}

interface MobileShellProps {
  children: React.ReactNode
}

export function MobileShell({ children }: MobileShellProps) {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Registra Service Worker para notificações push PWA
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
          if (!vapidKey) return
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKey,
          })
        })
        .then(sub => { if (sub) savePushSubscription(sub) })
        .catch(err => console.log('[push] not available:', err))
    }
  }, [])

  if (isDesktop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl" aria-hidden="true">📱</p>
          <h1 className="mt-4 text-lg font-bold text-gray-900">Painel disponível no celular</h1>
          <p className="mt-2 text-sm text-gray-500">
            O painel da Lara é otimizado para uso no celular.
            Acesse pelo seu smartphone para a melhor experiência.
          </p>
          <p className="mt-4 text-xs text-gray-400">
            Você pode adicionar o painel à tela inicial do seu celular para acesso rápido.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
