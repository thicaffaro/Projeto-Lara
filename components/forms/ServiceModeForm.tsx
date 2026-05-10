'use client'

/**
 * ServiceModeForm.tsx — Passo 1 do onboarding
 * Esteticista escolhe: studio (endereço fixo) ou home (domicílio).
 * Após a escolha, coleta os dados específicos de cada modo.
 *
 * Modos do schema (service_mode enum): 'studio' | 'home' — nunca ambos.
 * Ver /docs/glossary.md — Modos de atendimento.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { StudioAddress, SetupState } from '@/lib/onboarding-types'
import { maskPhone } from '@/lib/validation'

interface ServiceModeFormProps {
  initial: Pick<SetupState, 'serviceMode' | 'studioAddress' | 'homeRadiusKm' | 'homeBufferMin'>
  onSave: (data: {
    serviceMode: 'studio' | 'home'
    studioAddress?: StudioAddress
    homeRadiusKm?: number
    homeBufferMin?: number
  }) => void
}

// ── Sub-form: endereço do studio ──────────────────────────────────────────────

function StudioAddressForm({
  initial,
  onSave,
}: {
  initial: StudioAddress | null
  onSave: (address: StudioAddress) => void
}) {
  const [addr, setAddr] = useState<StudioAddress>(
    initial ?? {
      street: '', number: '', complement: '', neighborhood: '',
      city: '', state: '', zip_code: '',
    }
  )
  const [error, setError] = useState<string>()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!addr.street || !addr.number || !addr.neighborhood || !addr.city || !addr.state || !addr.zip_code) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }
    setError(undefined)
    onSave(addr)
  }

  const field = (
    id: keyof StudioAddress,
    label: string,
    placeholder: string,
    required = true,
    className = '',
  ) => (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="ml-1 text-red-400">*</span>}
      </label>
      <input
        id={id}
        type="text"
        value={String(addr[id] ?? '')}
        onChange={e => setAddr(a => ({ ...a, [id]: e.target.value }))}
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-semibold text-gray-700">Endereço do seu studio ou clínica</p>

      {field('zip_code', 'CEP', '00000-000', true, 'w-32')}

      <div className="grid grid-cols-3 gap-3">
        {field('street', 'Rua / Avenida', 'Rua das Flores', true, 'col-span-2')}
        {field('number', 'Número', '123', true)}
      </div>

      {field('complement', 'Complemento', 'Sala 2, andar 3', false)}

      <div className="grid grid-cols-2 gap-3">
        {field('neighborhood', 'Bairro', 'Vila Mariana', true)}
        {field('city', 'Cidade', 'São Paulo', true)}
      </div>

      {field('state', 'Estado (sigla)', 'SP', true, 'w-24')}

      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      <p className="text-xs text-gray-400">
        {/* TODO: adicionar geocodificação via Nominatim → Google Places (ver /lib/geocoding.ts) */}
        Endereço será verificado via geocodificação antes de salvar.
      </p>

      <button
        type="submit"
        className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
      >
        Confirmar endereço e continuar
      </button>
    </form>
  )
}

// ── Sub-form: configurações de domicílio ──────────────────────────────────────

function HomeServiceForm({
  initial,
  onSave,
}: {
  initial: { radiusKm: number; bufferMin: number }
  onSave: (data: { radiusKm: number; bufferMin: number }) => void
}) {
  const [radiusKm, setRadiusKm]   = useState(initial.radiusKm)
  const [bufferMin, setBufferMin] = useState(initial.bufferMin)

  return (
    <div className="space-y-6">
      {/* Raio máximo */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Raio máximo de atendimento
          <span className="ml-2 font-bold text-rose-600">{radiusKm} km</span>
        </label>
        <input
          type="range"
          min={5} max={50} step={5}
          value={radiusKm}
          onChange={e => setRadiusKm(Number(e.target.value))}
          className="mt-2 w-full accent-rose-500"
          aria-label={`Raio de atendimento: ${radiusKm} km`}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>5 km</span><span>50 km</span>
        </div>
      </div>

      {/* Buffer entre atendimentos */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Tempo entre atendimentos (deslocamento)
          <span className="ml-2 font-bold text-rose-600">{bufferMin} min</span>
        </label>
        <input
          type="range"
          min={15} max={60} step={5}
          value={bufferMin}
          onChange={e => setBufferMin(Number(e.target.value))}
          className="mt-2 w-full accent-rose-500"
          aria-label={`Buffer entre atendimentos: ${bufferMin} min`}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>15 min</span><span>60 min</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Tempo reservado para se deslocar entre um atendimento e o próximo.
        </p>
      </div>

      <button
        onClick={() => onSave({ radiusKm, bufferMin })}
        className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
      >
        Confirmar e continuar
      </button>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ServiceModeForm({ initial, onSave }: ServiceModeFormProps) {
  const [selectedMode, setSelectedMode] = useState<'studio' | 'home' | null>(initial.serviceMode)
  const [showDetails, setShowDetails]   = useState(!!initial.serviceMode)

  function handleModeSelect(mode: 'studio' | 'home') {
    setSelectedMode(mode)
    setShowDetails(true)
  }

  const modes = [
    {
      id: 'studio' as const,
      icon: '🏠',
      title: 'Atendo no meu studio/clínica',
      description: 'Tenho endereço fixo onde recebo clientes.',
    },
    {
      id: 'home' as const,
      icon: '🚗',
      title: 'Atendo em casa das clientes (domicílio)',
      description: 'Vou até o endereço de cada cliente.',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Seleção do modo */}
      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map(mode => (
          <motion.button
            key={mode.id}
            onClick={() => handleModeSelect(mode.id)}
            whileTap={{ scale: 0.98 }}
            aria-pressed={selectedMode === mode.id}
            className={`flex flex-col gap-2 rounded-2xl border-2 p-5 text-left transition ${
              selectedMode === mode.id
                ? 'border-rose-500 bg-rose-50'
                : 'border-gray-200 bg-white hover:border-rose-200'
            }`}
          >
            <span className="text-2xl" aria-hidden="true">{mode.icon}</span>
            <span className="text-sm font-semibold text-gray-900">{mode.title}</span>
            <span className="text-xs text-gray-500">{mode.description}</span>
          </motion.button>
        ))}
      </div>

      {/* Detalhe conforme modo selecionado */}
      {showDetails && selectedMode === 'studio' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
        >
          <StudioAddressForm
            initial={initial.studioAddress}
            onSave={address =>
              onSave({ serviceMode: 'studio', studioAddress: address })
            }
          />
        </motion.div>
      )}

      {showDetails && selectedMode === 'home' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
        >
          <HomeServiceForm
            initial={{ radiusKm: initial.homeRadiusKm, bufferMin: initial.homeBufferMin }}
            onSave={({ radiusKm, bufferMin }) =>
              onSave({ serviceMode: 'home', homeRadiusKm: radiusKm, homeBufferMin: bufferMin })
            }
          />
        </motion.div>
      )}
    </div>
  )
}
