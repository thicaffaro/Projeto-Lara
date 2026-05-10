'use client'

/**
 * WorkingHoursForm.tsx — Passo 2 do onboarding
 * Configura horários de atendimento por dia da semana.
 * Suporta múltiplas janelas por dia (ex: 9h-12h e 14h-18h).
 *
 * Salva em professionals.working_hours JSONB:
 * { "monday": [{"start":"09:00","end":"18:00"}], "tuesday": null, ... }
 */

import { useState } from 'react'
import type { WorkingHours, WeekdayKey, TimeWindow } from '@/lib/onboarding-types'
import { WEEKDAY_LABELS } from '@/lib/onboarding-types'

interface WorkingHoursFormProps {
  initial: WorkingHours
  onSave: (hours: WorkingHours) => void
}

const WEEKDAYS: WeekdayKey[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]

const DEFAULT_WINDOW: TimeWindow = { start: '09:00', end: '18:00' }

// Verifica se janelas se sobrepõem
function hasOverlap(windows: TimeWindow[]): boolean {
  if (windows.length < 2) return false
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start))
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].end > sorted[i + 1].start) return true
  }
  return false
}

// ── Sub-componente: linha de janela de horário ────────────────────────────────

function TimeWindowRow({
  window: tw,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  window: TimeWindow
  index: number
  onUpdate: (w: TimeWindow) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only">{`Janela ${index + 1} — início`}</label>
      <input
        type="time"
        value={tw.start}
        onChange={e => onUpdate({ ...tw, start: e.target.value })}
        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-rose-400 focus:outline-none"
      />
      <span className="text-xs text-gray-400">até</span>
      <label className="sr-only">{`Janela ${index + 1} — fim`}</label>
      <input
        type="time"
        value={tw.end}
        onChange={e => onUpdate({ ...tw, end: e.target.value })}
        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-rose-400 focus:outline-none"
      />
      {canRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remover janela ${index + 1}`}
          className="ml-1 rounded-full p-1 text-gray-300 hover:bg-gray-100 hover:text-red-400"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function WorkingHoursForm({ initial, onSave }: WorkingHoursFormProps) {
  const [hours, setHours] = useState<WorkingHours>(initial)
  const [errors, setErrors] = useState<Partial<Record<WeekdayKey, string>>>({})

  function isDayActive(day: WeekdayKey): boolean {
    return !!hours[day] && (hours[day]?.length ?? 0) > 0
  }

  function toggleDay(day: WeekdayKey) {
    if (isDayActive(day)) {
      setHours(h => ({ ...h, [day]: null }))
      setErrors(e => ({ ...e, [day]: undefined }))
    } else {
      setHours(h => ({ ...h, [day]: [{ ...DEFAULT_WINDOW }] }))
    }
  }

  function addWindow(day: WeekdayKey) {
    const current = hours[day] ?? []
    setHours(h => ({ ...h, [day]: [...current, { start: '14:00', end: '18:00' }] }))
  }

  function updateWindow(day: WeekdayKey, index: number, window: TimeWindow) {
    const current = [...(hours[day] ?? [])]
    current[index] = window
    setHours(h => ({ ...h, [day]: current }))

    if (hasOverlap(current)) {
      setErrors(e => ({ ...e, [day]: 'Janelas se sobrepõem. Ajuste os horários.' }))
    } else {
      setErrors(e => ({ ...e, [day]: undefined }))
    }
  }

  function removeWindow(day: WeekdayKey, index: number) {
    const current = [...(hours[day] ?? [])]
    current.splice(index, 1)
    setHours(h => ({ ...h, [day]: current.length > 0 ? current : null }))
  }

  function handleSave() {
    // Valida overlaps em todos os dias ativos
    const newErrors: Partial<Record<WeekdayKey, string>> = {}
    let hasErrors = false

    for (const day of WEEKDAYS) {
      const windows = hours[day]
      if (windows && windows.length > 1 && hasOverlap(windows)) {
        newErrors[day] = 'Janelas se sobrepõem.'
        hasErrors = true
      }
    }

    setErrors(newErrors)
    if (hasErrors) return

    const hasAnyActive = WEEKDAYS.some(d => isDayActive(d))
    if (!hasAnyActive) {
      alert('Configure ao menos um dia de atendimento.')
      return
    }

    onSave(hours)
  }

  return (
    <div className="space-y-3">
      {WEEKDAYS.map(day => {
        const active   = isDayActive(day)
        const windows  = hours[day] ?? []
        const dayError = errors[day]

        return (
          <div
            key={day}
            className={`rounded-2xl border p-4 transition ${
              active ? 'border-rose-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
            }`}
          >
            {/* Toggle do dia */}
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleDay(day)}
                className="h-4 w-4 rounded accent-rose-500"
              />
              <span className={`text-sm font-semibold ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                {WEEKDAY_LABELS[day]}
              </span>
            </label>

            {/* Janelas de horário */}
            {active && (
              <div className="mt-3 space-y-2 pl-7">
                {windows.map((tw, i) => (
                  <TimeWindowRow
                    key={i}
                    window={tw}
                    index={i}
                    onUpdate={w => updateWindow(day, i, w)}
                    onRemove={() => removeWindow(day, i)}
                    canRemove={windows.length > 1}
                  />
                ))}

                {dayError && (
                  <p role="alert" className="text-xs text-red-500">{dayError}</p>
                )}

                <button
                  onClick={() => addWindow(day)}
                  className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600"
                >
                  <span aria-hidden="true">+</span> Adicionar janela (ex: pausa de almoço)
                </button>
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={handleSave}
        className="mt-2 w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
      >
        Salvar horários e continuar
      </button>
    </div>
  )
}
