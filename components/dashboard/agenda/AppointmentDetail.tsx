'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomSheet }  from '@/components/ui/BottomSheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatTime }   from '@/lib/timezone'

export interface AppointmentDetailData {
  id: string
  starts_at: string
  ends_at: string
  protocol_name: string
  status: string
  service_location: string
  contact_id: string
  contact_name: string | null
  contact_phone: string
  address?: string | null
  duration_min?: number
  price_brl?: number
  timezone: string
}

interface Props {
  appointment: AppointmentDetailData | null
  onClose: () => void
}

export function AppointmentDetail({ appointment, onClose }: Props) {
  const router  = useRouter()
  const [dialog, setDialog] = useState<'cancel' | 'noshow' | null>(null)
  const [loading, setLoading] = useState(false)

  if (!appointment) return null

  async function handleAction(action: 'cancel' | 'no_show') {
    if (!appointment) return
    setLoading(true)
    try {
      await fetch('/api/dashboard/agenda/appointment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointment.id, status: action === 'cancel' ? 'cancelled' : 'no_show' }),
      })
      router.refresh()
      onClose()
    } finally {
      setLoading(false)
      setDialog(null)
    }
  }

  const time  = formatTime(appointment.starts_at, appointment.timezone)
  const isHome = appointment.service_location === 'client_home'

  return (
    <>
      <BottomSheet isOpen={!!appointment} onClose={onClose} title="Detalhes da sessão" size="expanded">
        <div className="space-y-4 pb-4">
          {/* Info da cliente */}
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-base font-bold text-gray-900">
              {appointment.contact_name ?? 'Cliente'}
            </p>
            <p className="text-sm text-gray-500">{appointment.contact_phone}</p>
          </div>

          {/* Protocolo */}
          <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
            <div>
              <p className="text-xs font-medium text-gray-400">Protocolo</p>
              <p className="text-sm font-semibold text-gray-900">{appointment.protocol_name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-gray-400">Horário</p>
              <p className="text-sm font-bold text-rose-500">{time}</p>
            </div>
          </div>

          {/* Endereço (domicílio) */}
          {isHome && appointment.address && (
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-400">Endereço</p>
              <p className="text-sm text-gray-900">{appointment.address}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-rose-500 underline-offset-2 hover:underline"
              >
                📍 Abrir no Maps
              </a>
            </div>
          )}

          {/* Ações */}
          {appointment.status === 'confirmed' && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setDialog('cancel')}
                className="h-12 w-full rounded-2xl border border-red-200 text-sm font-medium text-red-600"
              >
                Cancelar sessão
              </button>
              <button
                onClick={() => setDialog('noshow')}
                className="h-12 w-full rounded-2xl border border-gray-200 text-sm font-medium text-gray-600"
              >
                Marcar não compareceu
              </button>
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        isOpen={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        onConfirm={() => handleAction('cancel')}
        title="Cancelar sessão?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Cancelar sessão"
        variant="danger"
        loading={loading}
      />

      <ConfirmDialog
        isOpen={dialog === 'noshow'}
        onClose={() => setDialog(null)}
        onConfirm={() => handleAction('no_show')}
        title="Marcar como não compareceu?"
        description="A sessão será registrada como no-show."
        confirmLabel="Confirmar"
        loading={loading}
      />
    </>
  )
}
