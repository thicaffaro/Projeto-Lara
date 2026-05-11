'use client'

import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useToast }    from '@/components/ui/Toast'
import { strings }     from '@/lib/strings'

const s = strings.dashboard.conversations

const MODES = [
  { id: 'full',         icon: '🟢', label: 'Modo completo',    desc: 'Lara responde tudo dentro do escopo' },
  { id: 'booking_only', icon: '🟡', label: 'Modo agendamento', desc: 'Lara responde só agendamentos' },
  { id: 'silent',       icon: '🔴', label: 'Modo silêncio',    desc: 'Lara nunca responde, tudo cai pra você' },
] as const

interface Props {
  contactId: string
  currentMode: 'full' | 'booking_only' | 'silent'
  isOpen: boolean
  onClose: () => void
  onUpdated: (mode: 'full' | 'booking_only' | 'silent') => void
}

export function LaraModeSwitcher({ contactId, currentMode, isOpen, onClose, onUpdated }: Props) {
  const [selected, setSelected] = useState(currentMode)
  const [loading,  setLoading]  = useState(false)
  const { toast }               = useToast()

  async function handleSave() {
    if (selected === currentMode) { onClose(); return }
    setLoading(true)
    try {
      await fetch(`/api/dashboard/contacts/${contactId}/lara-mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lara_mode: selected }),
      })
      toast(s.modeUpdated, 'success')
      onUpdated(selected)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Modo da Lara">
      <div className="space-y-2 pb-4">
        {MODES.map(mode => (
          <button
            key={mode.id}
            onClick={() => setSelected(mode.id)}
            aria-pressed={selected === mode.id}
            className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
              selected === mode.id ? 'border-rose-500 bg-rose-50' : 'border-gray-100 bg-white'
            }`}
          >
            <span className="text-xl mt-0.5" aria-hidden="true">{mode.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{mode.label}</p>
              <p className="text-xs text-gray-500">{mode.desc}</p>
            </div>
          </button>
        ))}

        <button
          onClick={handleSave}
          disabled={loading}
          className="mt-2 h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </BottomSheet>
  )
}
