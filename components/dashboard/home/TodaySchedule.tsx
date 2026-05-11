'use client'

import Link from 'next/link'
import { formatTime } from '@/lib/timezone'

interface Appointment {
  id: string
  starts_at: string
  protocol_name: string
  contact_name: string | null
  contact_phone: string
  status: string
  neighborhood?: string | null
}

interface Props {
  appointments: Appointment[]
  timezone: string
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmado',  cls: 'bg-green-100 text-green-700' },
  pending:   { label: 'Pendente',    cls: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Cancelado',   cls: 'bg-red-100   text-red-700'   },
  no_show:   { label: 'Não compareceu', cls: 'bg-gray-100 text-gray-600' },
}

export function TodaySchedule({ appointments, timezone }: Props) {
  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-4xl" aria-hidden="true">🎉</p>
        <p className="mt-3 text-sm font-medium text-gray-600">Dia livre!</p>
        <p className="text-xs text-gray-400">Nenhuma sessão agendada para hoje.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 px-4 pb-4">
      {appointments.map(appt => {
        const badge = STATUS_BADGE[appt.status] ?? STATUS_BADGE.confirmed

        return (
          <div key={appt.id} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
            {/* Horário */}
            <div className="w-12 shrink-0 text-center">
              <p className="text-base font-bold text-rose-500">{formatTime(appt.starts_at, timezone)}</p>
            </div>

            {/* Detalhes */}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {appt.contact_name ?? appt.contact_phone}
              </p>
              <p className="text-xs text-gray-500">{appt.protocol_name}</p>
              {appt.neighborhood && (
                <p className="mt-0.5 text-xs text-gray-400">📍 {appt.neighborhood}</p>
              )}
            </div>

            {/* Badge status */}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
