'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { cookies } from 'next/headers'
import { formatTime, formatDateShort } from '@/lib/timezone'

interface RouteAppt {
  id: string; protocol_name: string; starts_at: string; status: string
  contact_name: string | null; contact_address: string | null; neighborhood: string | null
}

export default function RoutePage() {
  const [appts,   setAppts]   = useState<RouteAppt[]>([])
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10))
  const [isHome,  setIsHome]  = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/route?date=' + date)
      .then(r => r.json())
      .then((d: { appointments?: RouteAppt[]; is_home?: boolean }) => {
        setIsHome(d.is_home ?? false)
        setAppts(d.appointments ?? [])
      })
      .finally(() => setLoading(false))
  }, [date])

  if (!isHome && isHome !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-3xl">🏠</p>
        <p className="mt-3 text-sm text-gray-500">Esta funcionalidade é para atendimento domiciliar.</p>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-bold text-gray-900">Rota do dia</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="mt-2 h-9 w-full rounded-xl border border-gray-200 px-3 text-sm" />
      </div>

      {loading && <p className="py-10 text-center text-sm text-gray-400 animate-pulse">Carregando…</p>}

      {!loading && appts.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-3xl">🎉</p>
          <p className="mt-3 text-sm text-gray-500">Nenhuma visita domiciliar nesse dia.</p>
        </div>
      )}

      <div className="space-y-2 px-4 pt-3">
        {appts.map(a => (
          <div key={a.id} className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-rose-500">{formatTime(a.starts_at, 'America/Sao_Paulo')}</span>
              <span className="text-xs text-gray-400">{a.neighborhood ?? ''}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-gray-900">{a.contact_name ?? 'Cliente'}</p>
            <p className="text-xs text-gray-500">{a.protocol_name}</p>
            {a.contact_address && (
              <div className="mt-2 flex items-center gap-2">
                <p className="flex-1 text-xs text-gray-400">{a.contact_address}</p>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.contact_address)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs text-rose-500">
                  📍 Maps
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
