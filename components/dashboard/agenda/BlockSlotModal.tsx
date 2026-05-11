'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomSheet } from '@/components/ui/BottomSheet'

interface Props {
  isOpen: boolean
  onClose: () => void
  professionalId: string
  defaultDate?: string
}

const REASONS = ['Pessoal', 'Almoço', 'Curso', 'Reunião', 'Outro']

export function BlockSlotModal({ isOpen, onClose, professionalId, defaultDate }: Props) {
  const router = useRouter()
  const today  = defaultDate ?? new Date().toISOString().slice(0, 10)

  const [date,    setDate]    = useState(today)
  const [startAt, setStartAt] = useState('09:00')
  const [endAt,   setEndAt]   = useState('10:00')
  const [reason,  setReason]  = useState('Pessoal')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string>()

  async function handleSave() {
    if (startAt >= endAt) { setError('Horário de fim deve ser após o início.'); return }
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch('/api/dashboard/agenda/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professional_id: professionalId, date, start_time: startAt, end_time: endAt, title: reason }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Erro ao bloquear.'); return }
      router.refresh()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Bloquear horário">
      <div className="space-y-4 pb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500">Data</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} min={today}
            className="mt-1 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-rose-400 focus:outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Início</label>
            <input type="time" value={startAt} onChange={e => setStartAt(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-rose-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Fim</label>
            <input type="time" value={endAt} onChange={e => setEndAt(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-rose-400 focus:outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">Motivo</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {REASONS.map(r => (
              <button key={r} onClick={() => setReason(r)}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  reason === r ? 'bg-rose-500 text-white' : 'border border-gray-200 text-gray-600'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

        <button onClick={handleSave} disabled={loading}
          className="h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? 'Salvando…' : 'Bloquear horário'}
        </button>
      </div>
    </BottomSheet>
  )
}
