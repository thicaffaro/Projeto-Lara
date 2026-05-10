'use client'

/**
 * ResetPinForm.tsx
 * Formulário de definição de novo PIN após validação de token.
 * Reusa PinInput e validatePin da Tarefa 2.
 *
 * 2 etapas: PIN novo → confirmação
 */

import { useState } from 'react'
import Link from 'next/link'
import { PinInput } from '@/components/dashboard/PinInput'
import { validatePin } from '@/lib/security/blocked-pins'

interface Props {
  token: string
}

type Step = 'new' | 'confirm' | 'success'

export function ResetPinForm({ token }: Props) {
  const [step,    setStep]    = useState<Step>('new')
  const [newPin,  setNewPin]  = useState('')
  const [confirm, setConfirm] = useState('')
  const [error,   setError]   = useState<string>()
  const [loading, setLoading] = useState(false)

  function canAdvanceNew() {
    return newPin.length === 4 && validatePin(newPin) === null
  }

  function handleNextFromNew() {
    const err = validatePin(newPin)
    if (err) { setError(err); return }
    setError(undefined)
    setStep('confirm')
  }

  async function handleSubmit() {
    if (confirm !== newPin) {
      setError('Os PINs não coincidem. Tente novamente.')
      setConfirm('')
      return
    }

    setLoading(true)
    setError(undefined)

    try {
      const res = await fetch('/api/auth/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_pin: newPin }),
      })

      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Erro ao resetar PIN.')
        return
      }

      setStep('success')
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Sucesso ───────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-4">
        <p className="text-4xl" aria-hidden="true">✅</p>
        <div>
          <p className="text-base font-bold text-green-800">PIN resetado com sucesso!</p>
          <p className="mt-1 text-sm text-green-700">
            Você receberá uma confirmação no WhatsApp.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
        >
          Ir para o painel
        </Link>
      </div>
    )
  }

  // ── PIN novo ──────────────────────────────────────────────────────────────
  if (step === 'new') {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-500">
            Etapa 1 de 2
          </p>
          <p className="mt-1 text-sm text-gray-500">Escolha um novo PIN de 4 dígitos.</p>
        </div>

        <PinInput
          value={newPin}
          onChange={setNewPin}
          label="Novo PIN"
          disabled={loading}
          autoFocus
          showTrivialWarning
        />

        {error && (
          <p role="alert" className="text-xs text-red-600">{error}</p>
        )}

        <button
          onClick={handleNextFromNew}
          disabled={!canAdvanceNew() || loading}
          className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    )
  }

  // ── Confirmação ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-500">
          Etapa 2 de 2
        </p>
        <p className="mt-1 text-sm text-gray-500">Digite o novo PIN novamente para confirmar.</p>
      </div>

      <PinInput
        key="confirm"
        value={confirm}
        onChange={setConfirm}
        label="Confirmar novo PIN"
        disabled={loading}
        autoFocus
      />

      {confirm.length === 4 && (
        <p className={`text-xs ${confirm === newPin ? 'text-green-600' : 'text-red-600'}`}>
          {confirm === newPin ? '✅ PINs coincidem' : '❌ PINs não coincidem'}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => { setStep('new'); setConfirm(''); setError(undefined) }}
          disabled={loading}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          onClick={handleSubmit}
          disabled={confirm.length < 4 || loading}
          className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40"
        >
          {loading ? 'Salvando…' : 'Resetar PIN'}
        </button>
      </div>
    </div>
  )
}
