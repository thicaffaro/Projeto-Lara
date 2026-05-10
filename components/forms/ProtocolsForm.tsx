'use client'

/**
 * ProtocolsForm.tsx — Passo 4 do onboarding
 * Seleção de protocolos do catálogo + protocolos personalizados.
 *
 * Vocabulário: "protocolo" (nunca "serviço") — ver /docs/glossary.md
 * Catálogo: PROTOCOL_CATALOG (26 itens em 3 categorias)
 * Salva em professionals.protocols JSONB.
 */

import { useState } from 'react'
import { PROTOCOL_CATALOG, type ProtocolCategory } from '@/lib/protocols'
import type { ProfessionalProtocol } from '@/lib/onboarding-types'

interface ProtocolsFormProps {
  initial: ProfessionalProtocol[]
  onSave: (protocols: ProfessionalProtocol[]) => void
}

type TabId = ProtocolCategory

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'facial',       label: 'Faciais',      icon: '🌸' },
  { id: 'corporal',     label: 'Corporais',    icon: '💆' },
  { id: 'complementar', label: 'Complementar', icon: '✨' },
]

// ── Modal de protocolo personalizado ─────────────────────────────────────────

function CustomProtocolModal({
  onAdd,
  onClose,
}: {
  onAdd: (p: ProfessionalProtocol) => void
  onClose: () => void
}) {
  const [name, setName]     = useState('')
  const [cat, setCat]       = useState<ProtocolCategory>('facial')
  const [dur, setDur]       = useState(60)
  const [price, setPrice]   = useState('')
  const [error, setError]   = useState<string>()

  function handleAdd() {
    if (!name.trim()) { setError('Nome obrigatório.'); return }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      setError('Preço obrigatório.'); return
    }
    onAdd({ name: name.trim(), category: cat, duration_min: dur, price_brl: Number(price) })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-protocol-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 id="custom-protocol-title" className="mb-4 text-base font-bold text-gray-900">
          Adicionar protocolo personalizado
        </h3>

        <div className="space-y-3">
          <div>
            <label htmlFor="cp-name" className="block text-sm font-medium text-gray-700">
              Nome do protocolo <span className="text-red-400">*</span>
            </label>
            <input
              id="cp-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Massagem com bambu"
              className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>

          <div>
            <label htmlFor="cp-category" className="block text-sm font-medium text-gray-700">Categoria</label>
            <select
              id="cp-category"
              value={cat}
              onChange={e => setCat(e.target.value as ProtocolCategory)}
              className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-rose-400 focus:outline-none"
            >
              {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="cp-duration" className="block text-sm font-medium text-gray-700">
              Duração (minutos)
            </label>
            <input
              id="cp-duration"
              type="number"
              min={15} max={360} step={5}
              value={dur}
              onChange={e => setDur(Number(e.target.value))}
              className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-rose-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="cp-price" className="block text-sm font-medium text-gray-700">
              Preço (R$) <span className="text-red-400">*</span>
            </label>
            <input
              id="cp-price"
              type="number"
              min={0} step={0.01}
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="150.00"
              className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-rose-400 focus:outline-none"
            />
          </div>
        </div>

        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleAdd}
            className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white hover:bg-rose-600"
          >
            Adicionar
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de protocolo ─────────────────────────────────────────────────────────

function ProtocolCard({
  name,
  defaultDuration,
  protocol,
  onChange,
}: {
  name: string
  defaultDuration: number
  protocol: ProfessionalProtocol | undefined
  onChange: (p: ProfessionalProtocol | null) => void
}) {
  const isSelected = !!protocol
  const [duration, setDuration] = useState(protocol?.duration_min ?? defaultDuration)
  const [price, setPrice]       = useState(String(protocol?.price_brl ?? ''))
  const [priceError, setPriceError] = useState<string>()

  function handleToggle() {
    if (!isSelected) {
      // Ao selecionar: precisa de preço
      onChange({ name, category: 'facial', duration_min: duration, price_brl: 0 })
    } else {
      onChange(null)
    }
  }

  function handlePriceChange(val: string) {
    setPrice(val)
    if (!val || isNaN(Number(val)) || Number(val) <= 0) {
      setPriceError('Informe o preço.')
    } else {
      setPriceError(undefined)
      onChange({ ...protocol!, price_brl: Number(val), duration_min: duration })
    }
  }

  function handleDurationChange(val: number) {
    setDuration(val)
    if (protocol) onChange({ ...protocol, duration_min: val })
  }

  return (
    <div
      className={`rounded-2xl border-2 p-4 transition ${
        isSelected ? 'border-rose-400 bg-rose-50' : 'border-gray-100 bg-white'
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleToggle}
          className="mt-0.5 h-4 w-4 accent-rose-500"
        />
        <div className="flex-1">
          <span className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
            {name}
          </span>

          {isSelected && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500">Duração (min)</label>
                <input
                  type="number" min={15} max={360} step={5}
                  value={duration}
                  onChange={e => handleDurationChange(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-rose-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">
                  Preço (R$) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number" min={0} step={0.01}
                  value={price}
                  onChange={e => handlePriceChange(e.target.value)}
                  placeholder="150"
                  className={`mt-1 w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${
                    priceError ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-rose-400 focus:ring-rose-200'
                  }`}
                />
                {priceError && <p className="mt-0.5 text-xs text-red-500">{priceError}</p>}
              </div>
            </div>
          )}
        </div>
      </label>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProtocolsForm({ initial, onSave }: ProtocolsFormProps) {
  const [activeTab, setActiveTab] = useState<TabId>('facial')
  const [selected, setSelected]   = useState<ProfessionalProtocol[]>(initial)
  const [customOpen, setCustomOpen] = useState(false)
  const [saveError, setSaveError]   = useState<string>()

  const catalogByTab = PROTOCOL_CATALOG.filter(p => p.category === activeTab)

  function getSelected(name: string): ProfessionalProtocol | undefined {
    return selected.find(p => p.name === name)
  }

  function handleChange(name: string, category: TabId, defaultDuration: number, protocol: ProfessionalProtocol | null) {
    if (protocol === null) {
      setSelected(s => s.filter(p => p.name !== name))
    } else {
      setSelected(s => {
        const existing = s.findIndex(p => p.name === name)
        const withCategory: ProfessionalProtocol = { ...protocol, category }
        if (existing >= 0) {
          const copy = [...s]
          copy[existing] = withCategory
          return copy
        }
        return [...s, withCategory]
      })
    }
  }

  function handleAddCustom(p: ProfessionalProtocol) {
    setSelected(s => [...s.filter(x => x.name !== p.name), p])
  }

  function handleSave() {
    // Validar que protocolos selecionados têm preço
    const missing = selected.filter(p => !p.price_brl || p.price_brl <= 0)
    if (missing.length > 0) {
      setSaveError(`Informe o preço de: ${missing.map(p => p.name).join(', ')}.`)
      return
    }
    if (selected.length === 0) {
      setSaveError('Selecione pelo menos 1 protocolo para continuar.')
      return
    }
    setSaveError(undefined)
    onSave(selected)
  }

  return (
    <div className="space-y-4">
      {/* Tabs por categoria */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
              activeTab === tab.id
                ? 'bg-white text-rose-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {selected.filter(p => p.category === tab.id).length > 0 && (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-xs text-rose-600">
                {selected.filter(p => p.category === tab.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de protocolos da aba ativa */}
      <div
        role="tabpanel"
        aria-label={`Protocolos ${activeTab}`}
        className="space-y-2 max-h-72 overflow-y-auto pr-1"
      >
        {catalogByTab.map(p => (
          <ProtocolCard
            key={p.name}
            name={p.name}
            defaultDuration={p.duration_min}
            protocol={getSelected(p.name)}
            onChange={proto => handleChange(p.name, activeTab, p.duration_min, proto)}
          />
        ))}
      </div>

      {/* Protocolo personalizado */}
      <button
        onClick={() => setCustomOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 py-3 text-sm font-medium text-rose-500 hover:bg-rose-50"
      >
        <span aria-hidden="true">+</span> Adicionar protocolo personalizado
      </button>

      {/* Contagem total */}
      <p className="text-center text-xs text-gray-400">
        {selected.length === 0
          ? 'Nenhum protocolo selecionado'
          : `${selected.length} protocolo${selected.length > 1 ? 's' : ''} selecionado${selected.length > 1 ? 's' : ''}`}
      </p>

      {saveError && <p role="alert" className="text-xs text-red-600">{saveError}</p>}

      <button
        onClick={handleSave}
        className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
      >
        Salvar protocolos e continuar
      </button>

      {customOpen && (
        <CustomProtocolModal
          onAdd={handleAddCustom}
          onClose={() => setCustomOpen(false)}
        />
      )}
    </div>
  )
}
