'use client'

export const dynamic = 'force-dynamic'

/**
 * /app/auth/setup-pin/page.tsx
 * Primeiro acesso: configura PIN de 4 dígitos (2x para confirmar).
 */

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PinInput } from '@/components/dashboard/PinInput'
import { validatePin } from '@/lib/security/blocked-pins'

// Suspense boundary required by Next.js 15 for useSearchParams()
export default function SetupPinPage() {
  return <Suspense><SetupPinContent /></Suspense>
}

function SetupPinContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pid          = searchParams.get('pid') ?? ''

  const [step,    setStep]    = useState<'new' | 'confirm'>('new')
  const [pinNew,  setPinNew]  = useState('')
  const [confirm, setConfirm] = useState('')
  const [error,   setError]   = useState<string>()
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (!pid) router.replace('/auth/expired') }, [pid, router])

  function handleNextStep() {
    const err = validatePin(pinNew)
    if (err) { setError(err); return }
    setError(undefined)
    setStep('confirm')
  }

  async function handleCreate() {
    if (confirm !== pinNew) {
      setError('Os PINs não coincidem.')
      setConfirm('')
      return
    }

    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch('/api/dashboard/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professional_id: pid, new_pin: pinNew }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? 'Erro ao criar PIN.'); return }
      router.replace('/dashboard')
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-xs space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-rose-500">Lara</p>
          <h1 className="mt-2 text-lg font-bold text-gray-900">Criar PIN de acesso</h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'new'
              ? 'Escolha um PIN de 4 dígitos para acessar seu painel.'
              : 'Digite o PIN novamente para confirmar.'}
          </p>
        </div>

        {/* Indicador de etapa */}
        <div className="flex justify-center gap-2">
          {['new', 'confirm'].map((s, i) => (
            <div
              key={s}
              className={`h-1.5 w-12 rounded-full transition-colors ${
                (step === 'confirm' ? i <= 1 : i === 0) ? 'bg-rose-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <PinInput
          key={step}
          value={step === 'new' ? pinNew : confirm}
          onChange={v => { step === 'new' ? setPinNew(v) : setConfirm(v); setError(undefined) }}
          label={step === 'new' ? 'Novo PIN' : 'Confirmar PIN'}
          disabled={loading}
          autoFocus
          showTrivialWarning={step === 'new'}
        />

        {step === 'confirm' && confirm.length === 4 && (
          <p className={`text-center text-xs ${confirm === pinNew ? 'text-green-600' : 'text-red-600'}`}>
            {confirm === pinNew ? '✅ PINs coincidem' : '❌ PINs não coincidem'}
          </p>
        )}

        {error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}

        <div className="flex flex-col gap-2">
          {step === 'new' ? (
            <button
              onClick={handleNextStep}
              disabled={pinNew.length < 4 || !!validatePin(pinNew)}
              className="h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <>
              <button
                onClick={handleCreate}
                disabled={confirm.length < 4 || loading}
                className="h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-40"
              >
                {loading ? 'Criando PIN…' : 'Criar PIN e entrar'}
              </button>
              <button onClick={() => { setStep('new'); setConfirm(''); setError(undefined) }}
                className="h-11 text-sm text-gray-400">
                Voltar
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}


