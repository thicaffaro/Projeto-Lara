'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback, Suspense } from 'react'
import { CalendarWeekView } from '@/components/dashboard/agenda/CalendarWeekView'
import { BlockSlotModal }   from '@/components/dashboard/agenda/BlockSlotModal'
import { PullToRefresh }    from '@/components/ui/PullToRefresh'
import { useSearchParams }  from 'next/navigation'

// Note: appointments data fetched via API for client-side interactivity
interface AppointmentData {
  id: string; starts_at: string; ends_at: string; protocol_name: string
  status: string; service_location: string; contact_id: string
  contact_name: string | null; contact_phone: string; address?: string | null
}

interface AgendaData {
  appointments: AppointmentData[]
  professionalId: string
  timezone: string
}

export default function AgendaPage() {
  return <Suspense><AgendaContent /></Suspense>
}

function AgendaContent() {
  const searchParams = useSearchParams()
  const openBlock    = searchParams.get('action') === 'block'

  const [refDate,      setRefDate]      = useState(new Date())
  const [showBlock,    setShowBlock]    = useState(openBlock)
  const [agendaData,   setAgendaData]   = useState<AgendaData | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [view,         setView]         = useState<'week' | 'day'>('week')

  const fetchAgenda = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/agenda/appointments')
      if (res.ok) setAgendaData(await res.json() as AgendaData)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useState(() => { fetchAgenda() })

  function handleWeekChange(dir: -1 | 1) {
    setRefDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir * 7)
      return d
    })
  }

  if (!agendaData && loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-gray-400 animate-pulse">Carregando agenda…</p>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={fetchAgenda}>
      <div className="pb-4">
        {/* Toggle view */}
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-base font-bold text-gray-900">Agenda</h1>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {(['week', 'day'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    view === v ? 'bg-rose-500 text-white' : 'text-gray-500'
                  }`}
                >
                  {v === 'week' ? 'Semana' : 'Dia'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowBlock(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              aria-label="Bloquear horário"
            >
              +
            </button>
          </div>
        </div>

        {agendaData && (
          <CalendarWeekView
            appointments={agendaData.appointments}
            referenceDate={refDate}
            timezone={agendaData.timezone}
            onWeekChange={handleWeekChange}
          />
        )}

        {agendaData && (
          <BlockSlotModal
            isOpen={showBlock}
            onClose={() => setShowBlock(false)}
            professionalId={agendaData.professionalId}
          />
        )}
      </div>
    </PullToRefresh>
  )
}
