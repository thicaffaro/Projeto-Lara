'use client'

/**
 * ChangePinForm.tsx
 * Client Component — formulário de 3 etapas para trocar/criar PIN.
 *
 * Etapa 1 (se hasExistingPin): PIN atual
 * Etapa 2: PIN novo (com validação inline de PIN trivial)
 * Etapa 3: Confirmação do PIN novo
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PinInput } from '@/components/dashboard/PinInput'
import { validatePin } from '@/lib/security/blocked-pins'

/**
 * Constrói a mensagem de erro progressivo de rate limit.
 * Especificação:
 *   remaining=2 → "PIN incorreto. 2 tentativas restantes."
 *   remaining=1 → "PIN incorreto. 1 tentativa restante. Próximo erro causará bloqueio de 1 hora."
 *   remaining=0 → "Use 'Esqueci meu PIN'."  (já bloqueado — tratado em estado blocked)
 */
function buildRateLimitMessage(remaining: number): string {
  if (remaining === 0) {
    return 'Use "Esqueci meu PIN" para recuperar o acesso.'
  }
  if (remaining === 1) {
    return `PIN incorreto. 1 tentativa restante. Próximo erro causará bloqueio de 1 hora.`
  }
  return `PIN incorreto. ${remaining} tentativas restantes.`
}

interface Props {
  hasExistingPin: boolean
}

type Step = 'current' | 'new' | 'confirm'

const STEPS_WITH_PIN: Step[]    = ['current', 'new', 'confirm']
const STEPS_WITHOUT_PIN: Step[] = ['new', 'confirm']

// Labels e descrições por etapa
const STEP_META: Record<Step, { label: string; description: string }> = {
  current: {
    label: 'PIN atual',
    description: 'Digite seu PIN de acesso atual.',
  },
  new: {
    label: 'Novo PIN',
    description: 'Escolha um PIN de 4 dígitos. Evite sequências fáceis.',
  },
  confirm: {
    label: 'Confirmar novo PIN',
    description: 'Digite o novo PIN novamente para confirmar.',
  },
}

export function ChangePinForm({ hasExistingPin }: Props) {
  // useRouter mantido para redirect futuro se necessário
  const _router = useRouter()
  const steps   = hasExistingPin ? STEPS_WITH_PIN : STEPS_WITHOUT_PIN
  const totalSteps = steps.length

  const [stepIndex,  setStepIndex]  = useState(0)
  const [pins,       setPins]       = useState<Record<Step, string>>({
    current: '', new: '', confirm: '',
  })
  const [error,   setError]   = useState<string>()
  const [loading, setLoading] = useState(false)
  const [blocked, setBlocked] = useState(false)
  /** true após troca bem-sucedida — exibe tela de confirmação */
  const [success, setSuccess] = useState(false)

  const currentStep = steps[stepIndex]
  const meta        = STEP_META[currentStep]
  const displayStep = stepIndex + 1

  function setPin(step: Step, value: string) {
    setPins(prev => ({ ...prev, [step]: value }))
    setError(undefined)
  }

  function canAdvance(): boolean {
    const pin = pins[currentStep]
    if (pin.length < 4) return false
    if (currentStep === 'new') {
      return validatePin(pin) === null
    }
    if (currentStep === 'confirm') {
      return pin === pins.new
    }
    return true
  }

  function handleNext() {
    setError(undefined)

    // Validação inline antes de avançar
    if (currentStep === 'new') {
      const err = validatePin(pins.new)
      if (err) { setError(err); return }
    }

    if (currentStep === 'confirm') {
      if (pins.confirm !== pins.new) {
        setError('Os PINs não coincidem. Tente novamente.')
        setPins(prev => ({ ...prev, confirm: '' }))
        return
      }
      // Última etapa — submete
      handleSubmit()
      return
    }

    setStepIndex(i => i + 1)
  }

  async function handleSubmit() {
    setLoading(true)
    setError(undefined)

    try {
      const res = await fetch('/api/dashboard/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_pin: hasExistingPin ? pins.current : undefined,
          new_pin: pins.new,
        }),
      })

      const json = await res.json() as {
        ok?: boolean
        error?: string
        remaining?: number
        ttlMinutes?: number
        message?: string
      }

      if (!res.ok) {
        if (json.error === 'blocked') {
          setBlocked(true)
          setError(json.message ?? 'Conta temporariamente bloqueada. Use "Esqueci meu PIN".')
          return
        }
        if (json.error === 'invalid_current_pin') {
          // Volta para etapa 1 — mensagem progressiva conforme tentativas restantes
          setStepIndex(0)
          setPins(prev => ({ ...prev, current: '' }))
          setError(buildRateLimitMessage(json.remaining ?? 0))
          return
        }
        setError(json.error ?? 'Erro ao trocar PIN. Tente novamente.')
        return
      }

      // Sucesso — mostra tela de confirmação (não redireciona imediatamente)
      setSuccess(true)
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Render sucesso ────────────────────────────────────────────────────────
  // Confirmação visual antes de voltar — cumpre V1: "PIN alterado com sucesso!"
  if (success) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-4">
        <p className="text-4xl" aria-hidden="true">✅</p>
        <div>
          <p className="text-base font-bold text-green-800">
            {hasExistingPin ? 'PIN alterado com sucesso!' : 'PIN criado com sucesso!'}
          </p>
          <p className="mt-1 text-sm text-green-700">
            Você receberá uma confirmação no WhatsApp.
          </p>
        </div>
        <Link
          href="/dashboard/lara/security"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
        >
          Voltar para Segurança
        </Link>
      </div>
    )
  }

  // ── Render bloqueado ──────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-2xl" aria-hidden="true">🔒</p>
        <p className="mt-3 text-sm font-semibold text-amber-800">
          Acesso temporariamente bloqueado
        </p>
        <p className="mt-1 text-sm text-amber-700">{error}</p>
        <a
          href="/auth/forgot-pin"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Esqueci meu PIN
        </a>
      </div>
    )
  }

  // ── Stepper visual ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Progresso */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                i < stepIndex  ? 'bg-green-500 text-white'
                : i === stepIndex ? 'bg-rose-500 text-white'
                : 'bg-gray-200 text-gray-400'
              }`}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              {i < stepIndex ? '✓' : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-8 ${i < stepIndex ? 'bg-green-300' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-gray-400">
          Etapa {displayStep} de {totalSteps}
        </span>
      </div>

      {/* Descrição da etapa */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-500">
          {meta.label}
        </p>
        <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
      </div>

      {/* Input de PIN — auto-foco na primeira abertura e ao avançar etapas */}
      <PinInput
        key={currentStep}        // remonta ao trocar etapa → dispara autoFocus
        value={pins[currentStep]}
        onChange={v => setPin(currentStep, v)}
        label={meta.label}
        disabled={loading}
        autoFocus
        showTrivialWarning={currentStep === 'new'}
      />

      {/* Confirmação — feedback de match inline */}
      {currentStep === 'confirm' && pins.confirm.length === 4 && (
        <p className={`text-xs ${pins.confirm === pins.new ? 'text-green-600' : 'text-red-600'}`}>
          {pins.confirm === pins.new ? '✅ PINs coincidem' : '❌ PINs não coincidem'}
        </p>
      )}

      {/* Erro */}
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* CTAs */}
      <div className="flex gap-3">
        {stepIndex > 0 && (
          <button
            onClick={() => { setStepIndex(i => i - 1); setError(undefined) }}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            Voltar
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canAdvance() || loading}
          className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40"
        >
          {loading
            ? 'Salvando…'
            : currentStep === 'confirm'
              ? (hasExistingPin ? 'Trocar PIN' : 'Criar PIN')
              : 'Continuar'}
        </button>
      </div>

      {/* Link para recuperação durante bloqueio parcial */}
      <p className="text-center text-xs text-gray-400">
        Não lembra do PIN atual?{' '}
        <a href="/auth/forgot-pin" className="text-rose-500 underline-offset-2 hover:underline">
          Esqueci meu PIN
        </a>
      </p>
    </div>
  )
}
