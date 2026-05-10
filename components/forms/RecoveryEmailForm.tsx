'use client'

/**
 * RecoveryEmailForm.tsx — Passo 6 do onboarding
 * Coleta email de recuperação de acesso.
 * Salva em professionals.recovery_email.
 * "Pular" registra em audit_log com event_type='recovery_email_skipped'.
 */

import { useState } from 'react'

interface RecoveryEmailFormProps {
  initial: string
  onSave: (email: string) => void
  onSkip: () => void
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function RecoveryEmailForm({ initial, onSave, onSkip }: RecoveryEmailFormProps) {
  const [email, setEmail]   = useState(initial)
  const [error, setError]   = useState<string>()
  const [saving, setSaving] = useState(false)

  function handleSave() {
    if (!email.trim()) {
      setError('Informe um e-mail válido ou clique em "Pular por enquanto".')
      return
    }
    if (!isValidEmail(email.trim())) {
      setError('Formato de e-mail inválido.')
      return
    }
    setError(undefined)
    setSaving(true)
    onSave(email.trim())
  }

  return (
    <div className="space-y-5">
      {/* Explicação */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          🔑 Caso você perca acesso ao seu PIN ou seu número Meta seja invalidado,
          precisamos de um canal alternativo para te ajudar a voltar.
        </p>
      </div>

      <div>
        <label htmlFor="recovery-email" className="block text-sm font-medium text-gray-700">
          E-mail de recuperação
        </label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(undefined) }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="seu@email.com"
          aria-describedby={error ? 'recovery-email-error' : 'recovery-email-hint'}
          aria-invalid={!!error}
          className={`mt-1 block w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-400 focus:ring-red-200'
              : 'border-gray-300 focus:border-rose-400 focus:ring-rose-200'
          }`}
        />
        <p id="recovery-email-hint" className="mt-1 text-xs text-gray-400">
          Usado apenas para recuperação de conta. Nunca enviamos spam.
        </p>
        {error && (
          <p id="recovery-email-error" role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar e continuar'}
        </button>
        <button
          onClick={onSkip}
          className="w-full rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50"
        >
          Pular por enquanto
        </button>
      </div>
    </div>
  )
}
