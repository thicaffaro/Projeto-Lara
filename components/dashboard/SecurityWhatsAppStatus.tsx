'use client'

/**
 * SecurityWhatsAppStatus.tsx
 * Seção de status do WhatsApp com refresh automático a cada 30s.
 * Client Component — único da página de segurança que precisa de interatividade.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SecurityCard } from './SecurityCard'

type WhatsAppStatus = 'connected' | 'token_invalid' | 'disconnected'

interface StatusData {
  status: WhatsAppStatus
  changedAt: string | null
}

const STATUS_CONFIG: Record<WhatsAppStatus, {
  badge: string
  label: string
  variant: 'default' | 'warning' | 'danger' | 'success'
  description: string
}> = {
  connected: {
    badge: '🟢',
    label: 'Conectado',
    variant: 'default',
    description: 'Seu WhatsApp está conectado e a Lara está funcionando normalmente.',
  },
  token_invalid: {
    badge: '🟡',
    label: 'Token inválido',
    variant: 'warning',
    description: 'Sua conexão com a Meta expirou. Reconecte para continuar recebendo mensagens.',
  },
  disconnected: {
    badge: '🔴',
    label: 'Desconectado',
    variant: 'danger',
    description: 'WhatsApp desconectado. A Lara não está respondendo mensagens.',
  },
}

function formatDate(iso: string | null): string {
  if (!iso) return 'data desconhecida'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  initialStatus: WhatsAppStatus
  initialChangedAt: string | null
}

export function SecurityWhatsAppStatus({ initialStatus, initialChangedAt }: Props) {
  const [data, setData] = useState<StatusData>({
    status: initialStatus,
    changedAt: initialChangedAt,
  })

  // Auto-refresh a cada 30s com pausa quando aba está em background.
  // Previne ~1440 req/h desnecessárias quando esteticista esquece o dashboard aberto.
  // Padrão a ser replicado em outros componentes com polling (ex: aba Conversas no Prompt D).
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    async function fetchStatus() {
      try {
        const res = await fetch('/api/dashboard/security/whatsapp-status', {
          cache: 'no-store',
        })
        if (res.ok) setData(await res.json() as StatusData)
      } catch {
        // Falha silenciosa — não interrompe o UX
      }
    }

    function startPolling() {
      fetchStatus()                                      // fetch imediato ao ganhar foco
      intervalId = setInterval(fetchStatus, 30_000)
    }

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    function handleVisibility() {
      if (document.hidden) stopPolling()
      else startPolling()
    }

    // Inicia apenas se a aba já está visível ao montar
    if (!document.hidden) startPolling()

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const cfg = STATUS_CONFIG[data.status]
  const dateLabel = data.status === 'connected'
    ? `Conectado em ${formatDate(data.changedAt)}`
    : `Desconectado em ${formatDate(data.changedAt)}`

  return (
    <SecurityCard
      icon="📱"
      title="Conexão WhatsApp"
      variant={cfg.variant}
      action={
        (data.status === 'token_invalid' || data.status === 'disconnected') ? (
          <Link
            href="/api/onboarding/reconnect"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
          >
            Reconectar agora
          </Link>
        ) : undefined
      }
    >
      {/* Badge de status */}
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden="true">{cfg.badge}</span>
        <span className="text-sm font-semibold text-gray-800">{cfg.label}</span>
      </div>

      <p className="text-sm text-gray-500">{cfg.description}</p>

      <p className="text-xs text-gray-400">{dateLabel}</p>

      {data.status === 'token_invalid' && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            ⚠️ Sua conexão com a Meta expirou. Reconecte para continuar recebendo mensagens e agendamentos.
          </p>
        </div>
      )}
    </SecurityCard>
  )
}
