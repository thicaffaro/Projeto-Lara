'use client'

/**
 * ServiceAreasForm.tsx — Passo 3 do onboarding (CONDICIONAL)
 * Exibido APENAS quando service_mode='home'.
 * Se mode='studio', o SetupStepper pula automaticamente para o Passo 4.
 *
 * Permite organizar atendimentos domiciliares por região/bairro por dia.
 * Salva em professionals.service_areas JSONB.
 */

import { useState } from 'react'
import type { ServiceAreas, WeekdayKey } from '@/lib/onboarding-types'
import { WEEKDAY_LABELS, WEEKDAYS_ISO } from '@/lib/onboarding-types'

interface ServiceAreasFormProps {
  initial: { enabled: boolean; areas: ServiceAreas }
  workingHours: Record<string, unknown>  // dias ativos nos horários
  onSave: (data: { enabled: boolean; areas: ServiceAreas }) => void
  onSkip: () => void
}

// Usa chaves ISO ('1'-'7') — mesmas usadas em working_hours
const WEEKDAYS = WEEKDAYS_ISO

export function ServiceAreasForm({ initial, workingHours, onSave, onSkip }: ServiceAreasFormProps) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [areas, setAreas]     = useState<ServiceAreas>(initial.areas)
  const [newArea, setNewArea] = useState<Partial<Record<WeekdayKey, string>>>({})

  // Dias que têm horário de trabalho configurado
  const activeDays = WEEKDAYS.filter(d => !!(workingHours as Record<string, unknown>)[d])

  function addArea(day: WeekdayKey) {
    const bairro = (newArea[day] ?? '').trim()
    if (!bairro) return

    const current = areas[day] ?? []
    if (current.includes(bairro)) return

    setAreas(a => ({ ...a, [day]: [...current, bairro] }))
    setNewArea(n => ({ ...n, [day]: '' }))
  }

  function removeArea(day: WeekdayKey, bairro: string) {
    const current = (areas[day] ?? []).filter(b => b !== bairro)
    setAreas(a => ({ ...a, [day]: current.length > 0 ? current : undefined }))
  }

  function handleSave() {
    if (!enabled) {
      onSave({ enabled: false, areas: {} })
    } else {
      onSave({ enabled: true, areas })
    }
  }

  return (
    <div className="space-y-5">
      {/* Pergunta principal */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">
          Você organiza atendimentos por região em dias específicos?
        </p>

        {[
          {
            value: false,
            title: 'Não, atendo qualquer região nos dias disponíveis',
            description: 'A Lara aceita clientes de qualquer endereço dentro do seu raio.',
          },
          {
            value: true,
            title: 'Sim, separo por região por dia',
            description: 'Você define quais bairros atende em cada dia.',
          },
        ].map(opt => (
          <button
            key={String(opt.value)}
            onClick={() => setEnabled(opt.value)}
            aria-pressed={enabled === opt.value}
            className={`flex w-full flex-col gap-1 rounded-2xl border-2 p-4 text-left transition ${
              enabled === opt.value
                ? 'border-rose-500 bg-rose-50'
                : 'border-gray-200 bg-white hover:border-rose-200'
            }`}
          >
            <span className="text-sm font-semibold text-gray-900">{opt.title}</span>
            <span className="text-xs text-gray-500">{opt.description}</span>
          </button>
        ))}
      </div>

      {/* Editor de regiões por dia */}
      {enabled && (
        <div className="space-y-3">
          {activeDays.length === 0 && (
            <p className="text-xs text-amber-600">
              Configure os horários de trabalho no passo anterior para ver os dias disponíveis.
            </p>
          )}

          {activeDays.map(day => (
            <div key={day} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-2 text-sm font-semibold text-gray-700">{WEEKDAY_LABELS[day]}</p>

              {/* Bairros já adicionados */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(areas[day] ?? []).map(bairro => (
                  <span
                    key={bairro}
                    className="flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-700"
                  >
                    {bairro}
                    <button
                      onClick={() => removeArea(day, bairro)}
                      aria-label={`Remover ${bairro}`}
                      className="ml-1 text-rose-400 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {(areas[day] ?? []).length === 0 && (
                  <span className="text-xs text-gray-400">Nenhum bairro adicionado</span>
                )}
              </div>

              {/* Input para novo bairro */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newArea[day] ?? ''}
                  onChange={e => setNewArea(n => ({ ...n, [day]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addArea(day))}
                  placeholder="Ex: Vila Mariana"
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                />
                <button
                  onClick={() => addArea(day)}
                  className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-200"
                >
                  + Adicionar
                </button>
              </div>
              {/* TODO: autocomplete de bairros via Nominatim com a cidade da profissional */}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
        >
          Salvar e continuar
        </button>
        <button
          onClick={onSkip}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50"
        >
          Pular
        </button>
      </div>
    </div>
  )
}
