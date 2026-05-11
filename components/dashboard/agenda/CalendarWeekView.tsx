'use client'

import { useState } from 'react'
import { formatTz, getWeekDays, isTodayInTz } from '@/lib/timezone'
import { AppointmentDetail, type AppointmentDetailData } from './AppointmentDetail'

interface CalendarAppointment {
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
}

interface Props {
  appointments: CalendarAppointment[]
  referenceDate: Date
  timezone: string
  onWeekChange: (dir: -1 | 1) => void
}

const STATUS_COLORS: Record<string, string> = {
  confirmed:  'bg-rose-100 border-l-2 border-rose-400 text-rose-800',
  pending:    'bg-amber-100 border-l-2 border-amber-400 text-amber-800',
  cancelled:  'bg-gray-100 border-l-2 border-gray-300 text-gray-400 line-through',
  no_show:    'bg-gray-100 border-l-2 border-gray-300 text-gray-400',
}

function getMinutesFromMidnight(isoTime: string): number {
  const d = new Date(isoTime)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

export function CalendarWeekView({ appointments, referenceDate, timezone, onWeekChange }: Props) {
  const [selectedAppt, setSelectedAppt] = useState<AppointmentDetailData | null>(null)
  const weekDays = getWeekDays(referenceDate, timezone)

  // Timeline: 7h até 22h (15 hours × 60px = 900px)
  const HOUR_START = 7
  const HOUR_END   = 22
  const PX_PER_MIN = 1 // 1px per minute

  // Group appointments by day
  const byDay = weekDays.map(day => {
    const dayStr = formatTz(day, 'yyyy-MM-dd', timezone)
    return appointments.filter(a => {
      const apptDay = formatTz(a.starts_at, 'yyyy-MM-dd', timezone)
      return apptDay === dayStr
    })
  })

  return (
    <div className="flex flex-col">
      {/* Cabeçalho da semana */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <button onClick={() => onWeekChange(-1)} aria-label="Semana anterior"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {formatTz(weekDays[0], 'dd/MM', timezone)} — {formatTz(weekDays[6], 'dd/MM', timezone)}
        </span>
        <button onClick={() => onWeekChange(1)} aria-label="Próxima semana"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
          ›
        </button>
      </div>

      {/* Grid de dias (scroll horizontal) */}
      <div className="overflow-x-auto">
        <div className="flex" style={{ minWidth: `${weekDays.length * 60 + 40}px` }}>
          {/* Coluna de horários */}
          <div className="w-10 shrink-0">
            <div className="h-8" /> {/* espaço header */}
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
              <div key={i} style={{ height: 60 }} className="flex items-start justify-end pr-1">
                <span className="text-[9px] text-gray-400">{HOUR_START + i}h</span>
              </div>
            ))}
          </div>

          {/* Colunas por dia */}
          {weekDays.map((day, dayIdx) => {
            const isToday = isTodayInTz(day, timezone)
            const dayLabel = formatTz(day, 'EEE dd', timezone)
            const dayAppts = byDay[dayIdx]

            return (
              <div key={dayIdx} className="flex-1 min-w-[52px]">
                {/* Header do dia */}
                <div className={`flex h-8 items-center justify-center text-[10px] font-semibold ${
                  isToday ? 'text-rose-500' : 'text-gray-500'
                }`}>
                  {dayLabel}
                </div>

                {/* Timeline */}
                <div
                  className="relative border-l border-gray-100"
                  style={{ height: (HOUR_END - HOUR_START) * 60 }}
                >
                  {/* Linhas de hora */}
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <div key={i} className="absolute w-full border-t border-gray-50"
                      style={{ top: i * 60 }} />
                  ))}

                  {/* Appointments */}
                  {dayAppts.map(appt => {
                    const startMin  = getMinutesFromMidnight(appt.starts_at) - HOUR_START * 60
                    const endMin    = getMinutesFromMidnight(appt.ends_at)   - HOUR_START * 60
                    const top       = Math.max(0, startMin) * PX_PER_MIN
                    const height    = Math.max(20, (endMin - startMin) * PX_PER_MIN)
                    const colorCls  = STATUS_COLORS[appt.status] ?? STATUS_COLORS.confirmed

                    return (
                      <button
                        key={appt.id}
                        onClick={() => setSelectedAppt({
                          ...appt,
                          address: appt.address ?? null,
                          timezone,
                        })}
                        className={`absolute left-0.5 right-0.5 rounded px-1 text-[9px] font-medium leading-tight overflow-hidden ${colorCls}`}
                        style={{ top, height: Math.min(height, 200) }}
                        aria-label={`${appt.protocol_name} às ${formatTz(appt.starts_at, 'HH:mm', timezone)}`}
                      >
                        <span className="block truncate">{formatTz(appt.starts_at, 'HH:mm', timezone)}</span>
                        <span className="block truncate opacity-75">{appt.contact_name ?? ''}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalhe do appointment selecionado */}
      <AppointmentDetail
        appointment={selectedAppt}
        onClose={() => setSelectedAppt(null)}
      />
    </div>
  )
}
