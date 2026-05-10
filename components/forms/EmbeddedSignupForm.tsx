'use client'

/**
 * EmbeddedSignupForm.tsx
 * Formulário de onboarding do WhatsApp com 6 etapas.
 *
 * Fases:
 *  'form'    → Coleta nome, telefone, CPF/CNPJ com validação
 *  'modal'   → PreOnboardingModal (3 checkboxes obrigatórios)
 *  'stepper' → 6 etapas do Embedded Signup
 *  'done'    → Redireciona para /onboarding/setup
 *
 * Etapas do stepper:
 *  1. Carrega Facebook SDK (lazy, timeout 10s)
 *  2. Abre popup Meta (Embedded Signup)
 *  3. Aguarda code + sessionInfo via postMessage (timeout 5min)
 *  4. POST /api/onboarding/exchange-token → cria professional + auth user
 *  5. POST /api/onboarding/register-number
 *  6. POST /api/onboarding/verify-code (request_code → input → verify)
 *
 * Regras críticas:
 *  - Tokens nunca logados (nem em erro)
 *  - Botão Suporte sempre visível em caso de erro
 *  - Stepper mantém etapa atual em falha (não reseta nem pula)
 *  - Redireciona para /onboarding/setup (não /dashboard)
 *
 * Modo reconexão: props.mode='reconnect' + props.professionalId
 *  - Pula fase 'form' → começa em 'stepper' diretamente
 *  - Usa /api/onboarding/reconnect em vez de exchange-token
 */

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { PreOnboardingModal } from '@/components/onboarding/PreOnboardingModal'
import {
  maskPhone,
  maskCpfCnpj,
  stripMask,
  isValidBrazilianPhone,
  isValidCpfOrCnpj,
} from '@/lib/validation'

// ── Declaração de tipos Facebook SDK ─────────────────────────────────────────

declare global {
  interface Window {
    FB: {
      init(config: { appId: string; version: string; cookie: boolean; xfbml: boolean }): void
      login(
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: {
          config_id: string
          response_type: string
          override_default_response_type: boolean
          extras: { sessionInfoVersion: number }
        }
      ): void
    }
    fbAsyncInit?: () => void
  }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Phase = 'form' | 'modal' | 'stepper' | 'done'
type StepStatus = 'pending' | 'loading' | 'success' | 'error'
type VerifySubPhase = 'request' | 'input' | 'verifying'

interface StepInfo {
  label: string
  description: string
  status: StepStatus
  error?: string
}

interface SessionInfo {
  wabaId: string
  phoneNumberId: string
}

interface FormFields {
  name: string
  phoneRaw: string      // dígitos apenas
  phoneMasked: string   // formatado para display
  cpfCnpjRaw: string
  cpfCnpjMasked: string
}

interface FormErrors {
  name?: string
  phone?: string
  cpfCnpj?: string
}

interface EmbeddedSignupFormProps {
  mode?: 'onboarding' | 'reconnect'
  professionalId?: string
}

// ── Constantes ────────────────────────────────────────────────────────────────

const SUPPORT_HREF = `https://wa.me/5511978663056`
const STEP_TIMEOUT_5MIN = 5 * 60 * 1000
const SDK_TIMEOUT_10S = 10_000

const INITIAL_STEPS: StepInfo[] = [
  { label: 'Conectando ao Facebook',  description: 'Carregando conector...', status: 'pending' },
  { label: 'Autorização Meta',        description: 'Aguardando sua autorização...', status: 'pending' },
  { label: 'Recebendo autorização',   description: 'Processando código...', status: 'pending' },
  { label: 'Salvando conexão',        description: 'Criptografando e salvando token...', status: 'pending' },
  { label: 'Registrando número',      description: 'Conectando seu número...', status: 'pending' },
  { label: 'Verificando número',      description: 'Confirmando seu número...', status: 'pending' },
]

// ── Componente auxiliar: StepIndicator ───────────────────────────────────────

function StepIndicator({ steps, currentStep }: { steps: StepInfo[]; currentStep: number }) {
  return (
    <ol aria-label="Progresso do onboarding" className="space-y-2">
      {steps.map((step, i) => {
        const isActive  = i === currentStep
        const isDone    = step.status === 'success'
        const isError   = step.status === 'error'
        const isPending = step.status === 'pending' && i > currentStep

        return (
          <li
            key={i}
            aria-current={isActive ? 'step' : undefined}
            className={`flex items-start gap-3 rounded-xl px-4 py-3 transition-colors ${
              isActive  ? 'bg-rose-50 ring-1 ring-rose-200'
              : isDone  ? 'bg-green-50'
              : isError ? 'bg-red-50 ring-1 ring-red-200'
              : 'bg-gray-50 opacity-50'
            }`}
          >
            {/* Ícone de status */}
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-base"
            >
              {isDone    ? '✅'
               : isError ? '❌'
               : isActive && step.status === 'loading' ? '⏳'
               : isPending ? '○'
               : '●'}
            </span>

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${
                isError ? 'text-red-700'
                : isDone ? 'text-green-700'
                : isActive ? 'text-rose-700'
                : 'text-gray-500'
              }`}>
                Etapa {i + 1} de {steps.length} — {step.label}
              </p>
              {isActive && step.status === 'loading' && (
                <p className="mt-0.5 text-xs text-gray-500">{step.description}</p>
              )}
              {isError && step.error && (
                <p className="mt-0.5 text-xs text-red-600">{step.error}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function EmbeddedSignupForm({ mode = 'onboarding', professionalId: existingId }: EmbeddedSignupFormProps) {
  const router = useRouter()
  const shouldReduceMotion = useReducedMotion()

  // ── Estado ─────────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<Phase>(mode === 'reconnect' ? 'stepper' : 'form')
  const [steps, setSteps] = useState<StepInfo[]>(INITIAL_STEPS)
  const [currentStep, setCurrentStep] = useState(0)
  const [professionalId, setProfessionalId] = useState<string | undefined>(existingId)

  // Formulário inicial
  const [fields, setFields] = useState<FormFields>({
    name: '', phoneRaw: '', phoneMasked: '', cpfCnpjRaw: '', cpfCnpjMasked: '',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Etapa 6: verificação de código
  const [verifySubPhase, setVerifySubPhase] = useState<VerifySubPhase>('request')
  const [verifyMethod, setVerifyMethod] = useState<'SMS' | 'VOICE'>('SMS')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyError, setVerifyError] = useState<string | undefined>()
  const [verifyLoading, setVerifyLoading] = useState(false)

  const sessionInfoRef = useRef<SessionInfo>({ wabaId: '', phoneNumberId: '' })

  // ── Helpers de estado do stepper ─────────────────────────────────────────

  function setStepStatus(index: number, status: StepStatus, error?: string) {
    setSteps(prev =>
      prev.map((s, i) => (i === index ? { ...s, status, error } : s))
    )
  }

  // ── Validação do formulário inicial ──────────────────────────────────────

  function validateForm(): boolean {
    const errors: FormErrors = {}

    if (!fields.name.trim()) {
      errors.name = 'Nome obrigatório'
    }
    if (!isValidBrazilianPhone(fields.phoneRaw)) {
      errors.phone = 'Telefone inválido. Use DDD + 9 dígitos: (11) 99999-9999'
    }
    if (!isValidCpfOrCnpj(fields.cpfCnpjRaw)) {
      errors.cpfCnpj = 'CPF ou CNPJ inválido'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ── Handlers do formulário ────────────────────────────────────────────────

  function handlePhoneChange(value: string) {
    const masked = maskPhone(value)
    setFields(f => ({ ...f, phoneMasked: masked, phoneRaw: stripMask(masked) }))
    if (formErrors.phone) setFormErrors(e => ({ ...e, phone: undefined }))
  }

  function handleCpfCnpjChange(value: string) {
    const masked = maskCpfCnpj(value)
    setFields(f => ({ ...f, cpfCnpjMasked: masked, cpfCnpjRaw: stripMask(masked) }))
    if (formErrors.cpfCnpj) setFormErrors(e => ({ ...e, cpfCnpj: undefined }))
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateForm()) return
    setFormSubmitting(true)
    // Abre o PreOnboardingModal antes do Embedded Signup
    setPhase('modal')
    setFormSubmitting(false)
  }

  // ── Retry seletivo por etapa ──────────────────────────────────────────────
  //
  // Regra:
  //   Etapas 1–4 (índices 0–3): precisam de novo código OAuth → restart completo
  //   Etapa 5 (índice 4):       professionalId já está em state → retry só step 5
  //   Etapa 6 (índice 5):       gerenciada pelos sub-phases de verificação
  //
  // Isso garante que a esteticista NÃO perde o progresso das etapas concluídas
  // quando apenas register-number (etapa 5) falha.
  function handleRetry() {
    if (currentStep === 4 && professionalId) {
      // Etapa 5 falhou: professionalId preservado, skip steps 1-4
      setStepStatus(4, 'pending', undefined)
      retryRegisterNumber(professionalId)
    } else {
      // Etapas 1-4: precisa de novo code OAuth → restart completo
      setSteps(INITIAL_STEPS)
      setCurrentStep(0)
      runOnboarding()
    }
  }

  async function retryRegisterNumber(profId: string) {
    setCurrentStep(4)
    setStepStatus(4, 'loading')
    try {
      const res = await fetch('/api/onboarding/register-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionalId: profId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setStepStatus(4, 'error', json.error ?? 'Falha ao registrar número.')
        return
      }
      setStepStatus(4, 'success')
      // Prossegue para etapa 6 com estado preservado
      setCurrentStep(5)
      setStepStatus(5, 'loading')
      await handleRequestCode(profId, verifyMethod)
    } catch {
      setStepStatus(4, 'error', 'Erro de rede ao registrar número.')
    }
  }

  // ── Fluxo de 6 etapas ────────────────────────────────────────────────────

  const runOnboarding = useCallback(async () => {
    setPhase('stepper')

    // ── Etapa 1: Carrega Facebook SDK ────────────────────────────────────────
    setCurrentStep(0)
    setStepStatus(0, 'loading')

    try {
      await loadFacebookSDK()
      setStepStatus(0, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não conseguimos carregar o conector do Facebook. Tente novamente.'
      setStepStatus(0, 'error', msg)
      return
    }

    // ── Etapa 2: Abre Embedded Signup ────────────────────────────────────────
    setCurrentStep(1)
    setStepStatus(1, 'loading')

    let sessionResult: { code: string; wabaId: string; phoneNumberId: string }
    try {
      sessionResult = await openEmbeddedSignupAndWait()
      sessionInfoRef.current = { wabaId: sessionResult.wabaId, phoneNumberId: sessionResult.phoneNumberId }
      setStepStatus(1, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Autorização cancelada ou falhou.'
      setStepStatus(1, 'error', msg)
      return
    }

    // ── Etapa 3: Confirma recebimento do código ──────────────────────────────
    setCurrentStep(2)
    setStepStatus(2, 'loading')
    // O código já chegou no step anterior — esta etapa é apenas visual
    await sleep(400)
    setStepStatus(2, 'success')

    // ── Etapa 4: Troca token + cria professional ─────────────────────────────
    setCurrentStep(3)
    setStepStatus(3, 'loading')

    const exchangeEndpoint = mode === 'reconnect'
      ? '/api/onboarding/reconnect'
      : '/api/onboarding/exchange-token'

    let newProfessionalId: string
    try {
      const res = await fetch(exchangeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'reconnect'
            ? { code: sessionResult.code, ...sessionInfoRef.current, professionalId: existingId }
            : {
                code: sessionResult.code,
                wabaId: sessionResult.wabaId,
                phoneNumberId: sessionResult.phoneNumberId,
                name: fields.name.trim(),
                phoneNumber: fields.phoneRaw,
                cpfOrCnpj: fields.cpfCnpjRaw,
              }
        ),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setStepStatus(3, 'error', json.error ?? 'Falha ao salvar credenciais.')
        return
      }
      newProfessionalId = json.professionalId
      setProfessionalId(newProfessionalId)
      setStepStatus(3, 'success')
    } catch {
      setStepStatus(3, 'error', 'Erro de rede ao salvar credenciais. Verifique sua conexão.')
      return
    }

    // ── Etapa 5: Registra número ─────────────────────────────────────────────
    setCurrentStep(4)
    setStepStatus(4, 'loading')

    try {
      const res = await fetch('/api/onboarding/register-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionalId: newProfessionalId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setStepStatus(4, 'error', json.error ?? 'Falha ao registrar número.')
        return
      }
      setStepStatus(4, 'success')
    } catch {
      setStepStatus(4, 'error', 'Erro de rede ao registrar número.')
      return
    }

    // ── Etapa 6: Verificação de código ───────────────────────────────────────
    // Esta etapa tem UI própria — o usuário interage com o verifySubPhase
    setCurrentStep(5)
    setStepStatus(5, 'loading')
    // Solicita código automaticamente por SMS
    await handleRequestCode(newProfessionalId, 'SMS')
  }, [fields, mode, existingId])

  // ── Handlers da etapa 6 (verificação) ────────────────────────────────────

  async function handleRequestCode(profId: string, method: 'SMS' | 'VOICE') {
    setVerifyLoading(true)
    setVerifyError(undefined)

    try {
      const res = await fetch('/api/onboarding/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_code', professionalId: profId, method }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setVerifyError(json.error ?? 'Falha ao solicitar código.')
        return
      }
      setVerifySubPhase('input')
    } catch {
      setVerifyError('Erro de rede ao solicitar código.')
    } finally {
      setVerifyLoading(false)
    }
  }

  async function handleVerifyCode() {
    if (!professionalId || !/^\d{6}$/.test(verifyCode)) {
      setVerifyError('Digite os 6 dígitos do código.')
      return
    }

    setVerifyLoading(true)
    setVerifySubPhase('verifying')
    setVerifyError(undefined)

    try {
      const res = await fetch('/api/onboarding/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', professionalId, code: verifyCode }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setVerifySubPhase('input')
        setVerifyError(json.error ?? 'Código inválido. Tente novamente.')
        return
      }
      setStepStatus(5, 'success')
      setPhase('done')
      router.push(json.redirectTo ?? '/onboarding/setup')
    } catch {
      setVerifySubPhase('input')
      setVerifyError('Erro de rede ao verificar código.')
    } finally {
      setVerifyLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasError = steps.some(s => s.status === 'error')

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <AnimatePresence mode="wait">

        {/* ── Fase: formulário inicial ── */}
        {phase === 'form' && (
          <motion.form
            key="form"
            onSubmit={handleFormSubmit}
            initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: shouldReduceMotion ? 1 : 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            noValidate
            className="space-y-5"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Conecte seu WhatsApp</h1>
              <p className="mt-1 text-sm text-gray-500">
                Use seu número atual. Nenhum número novo será criado.
              </p>
            </div>

            {/* Nome */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Nome completo
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={fields.name}
                onChange={e => {
                  setFields(f => ({ ...f, name: e.target.value }))
                  if (formErrors.name) setFormErrors(ev => ({ ...ev, name: undefined }))
                }}
                aria-describedby={formErrors.name ? 'name-error' : undefined}
                aria-invalid={!!formErrors.name}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200 aria-[invalid=true]:border-red-400"
                placeholder="Ana Silva"
              />
              {formErrors.name && (
                <p id="name-error" role="alert" className="mt-1 text-xs text-red-600">
                  {formErrors.name}
                </p>
              )}
            </div>

            {/* Telefone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Número do WhatsApp
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={fields.phoneMasked}
                onChange={e => handlePhoneChange(e.target.value)}
                aria-describedby={formErrors.phone ? 'phone-error' : 'phone-hint'}
                aria-invalid={!!formErrors.phone}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200 aria-[invalid=true]:border-red-400"
                placeholder="(11) 99999-9999"
                maxLength={15}
              />
              <p id="phone-hint" className="mt-1 text-xs text-gray-400">
                Número que você já usa no WhatsApp hoje
              </p>
              {formErrors.phone && (
                <p id="phone-error" role="alert" className="mt-1 text-xs text-red-600">
                  {formErrors.phone}
                </p>
              )}
            </div>

            {/* CPF / CNPJ */}
            <div>
              <label htmlFor="cpfcnpj" className="block text-sm font-medium text-gray-700">
                CPF ou CNPJ
              </label>
              <input
                id="cpfcnpj"
                type="text"
                inputMode="numeric"
                value={fields.cpfCnpjMasked}
                onChange={e => handleCpfCnpjChange(e.target.value)}
                aria-describedby={formErrors.cpfCnpj ? 'cpfcnpj-error' : 'cpfcnpj-hint'}
                aria-invalid={!!formErrors.cpfCnpj}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200 aria-[invalid=true]:border-red-400"
                placeholder="000.000.000-00"
                maxLength={18}
              />
              <p id="cpfcnpj-hint" className="mt-1 text-xs text-gray-400">
                Pessoa física aceita. Não precisa de CNPJ.
              </p>
              {formErrors.cpfCnpj && (
                <p id="cpfcnpj-error" role="alert" className="mt-1 text-xs text-red-600">
                  {formErrors.cpfCnpj}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={formSubmitting}
              className="w-full rounded-xl bg-rose-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95 disabled:opacity-60"
            >
              {formSubmitting ? 'Verificando...' : 'Continuar'}
            </button>
          </motion.form>
        )}

        {/* ── Fase: stepper ── */}
        {(phase === 'stepper' || phase === 'done') && (
          <motion.div
            key="stepper"
            initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="space-y-6"
          >
            <div>
              <h1 className="text-xl font-bold text-gray-900">Conectando seu WhatsApp</h1>
              <p className="mt-1 text-sm text-gray-500">
                Etapa {currentStep + 1} de {steps.length}
              </p>
            </div>

            <StepIndicator steps={steps} currentStep={currentStep} />

            {/* Etapa 6: UI de verificação de código */}
            {currentStep === 5 && steps[5].status !== 'success' && (
              <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                {verifySubPhase === 'request' && (
                  <>
                    <p className="text-sm font-medium text-gray-700">
                      Como você quer receber o código de verificação?
                    </p>
                    <div className="flex gap-2">
                      {(['SMS', 'VOICE'] as const).map(method => (
                        <button
                          key={method}
                          onClick={() => {
                            setVerifyMethod(method)
                            if (professionalId) handleRequestCode(professionalId, method)
                          }}
                          disabled={verifyLoading}
                          className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            verifyMethod === method
                              ? 'border-rose-400 bg-rose-50 text-rose-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          } disabled:opacity-50`}
                        >
                          {method === 'SMS' ? '📱 SMS' : '📞 Ligação'}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {(verifySubPhase === 'input' || verifySubPhase === 'verifying') && (
                  <>
                    <p className="text-sm font-medium text-gray-700">
                      Digite o código de 6 dígitos recebido por {verifyMethod === 'SMS' ? 'SMS' : 'ligação'}:
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={verifyCode}
                      onChange={e => {
                        setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        setVerifyError(undefined)
                      }}
                      aria-label="Código de verificação de 6 dígitos"
                      aria-invalid={!!verifyError}
                      className="block w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-xl font-mono tracking-[0.4em] focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="000000"
                    />
                    {verifyError && (
                      <p role="alert" className="text-xs text-red-600">{verifyError}</p>
                    )}
                    <button
                      onClick={handleVerifyCode}
                      disabled={verifyLoading || verifyCode.length !== 6}
                      className="w-full rounded-xl bg-rose-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
                    >
                      {verifyLoading ? 'Verificando...' : 'Confirmar código'}
                    </button>
                    <button
                      onClick={() => {
                        setVerifySubPhase('request')
                        setVerifyCode('')
                        setVerifyError(undefined)
                      }}
                      className="w-full text-xs text-gray-400 underline-offset-2 hover:underline"
                    >
                      Solicitar novo código
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Botão Suporte — sempre visível em caso de erro */}
            {hasError && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  Algo deu errado. Nossa equipe pode ajudar você agora.
                </p>
                <a
                  href={SUPPORT_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium text-amber-700 underline-offset-2 hover:underline"
                >
                  <span aria-hidden="true">💬</span>
                  Falar com suporte pelo WhatsApp
                </a>
              </div>
            )}

            {/* Botão Tentar novamente (em erro antes da etapa 6) */}
            {hasError && currentStep < 5 && (
              <button
                onClick={handleRetry}
                className="w-full rounded-xl border border-rose-300 bg-white px-6 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                {currentStep === 4 && professionalId
                  ? 'Tentar novamente (etapa 5)'
                  : 'Tentar novamente (do início)'}
              </button>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* PreOnboardingModal — só na fase 'modal' */}
      <PreOnboardingModal
        isOpen={phase === 'modal'}
        onClose={() => setPhase('form')}
        onContinue={runOnboarding}
      />
    </div>
  )
}

// ── Funções utilitárias (client-side) ─────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function loadFacebookSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('loadFacebookSDK chamado fora do browser'))
      return
    }

    // SDK já carregado
    if (window.FB) { resolve(); return }

    const timeout = setTimeout(() => {
      reject(new Error('Não conseguimos carregar o conector do Facebook. Tente novamente.'))
    }, SDK_TIMEOUT_10S)

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_META_APP_ID!,
        version: process.env.NEXT_PUBLIC_META_GRAPH_VERSION ?? 'v19.0',
        cookie: true,
        xfbml: false,
      })
      clearTimeout(timeout)
      resolve()
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    script.async = true
    script.defer = true
    script.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Falha ao carregar SDK do Facebook. Verifique sua conexão.'))
    }
    document.head.appendChild(script)
  })
}

function openEmbeddedSignupAndWait(): Promise<{
  code: string
  wabaId: string
  phoneNumberId: string
}> {
  return new Promise((resolve, reject) => {
    let authCode: string | null = null
    let sessionData: { wabaId: string; phoneNumberId: string } | null = null

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handleMessage)
      reject(new Error('Timeout aguardando autorização do Facebook (5 minutos). Tente novamente.'))
    }, STEP_TIMEOUT_5MIN)

    function tryResolve() {
      if (authCode && sessionData) {
        clearTimeout(timeout)
        window.removeEventListener('message', handleMessage)
        resolve({ code: authCode, ...sessionData })
      }
    }

    function handleMessage(event: MessageEvent) {
      // Filtra origens que não sejam do Facebook
      if (
        typeof event.origin !== 'string' ||
        !event.origin.includes('facebook.com')
      ) return

      let data: Record<string, unknown>
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch { return }

      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return

      if (data.event === 'CANCEL') {
        clearTimeout(timeout)
        window.removeEventListener('message', handleMessage)
        reject(new Error('Autorização cancelada.'))
        return
      }

      if (data.event === 'ERROR') {
        clearTimeout(timeout)
        window.removeEventListener('message', handleMessage)
        reject(new Error('Erro durante a autorização Meta.'))
        return
      }

      // FINISH ou SEND — extrai sessionInfo
      if (data.event === 'FINISH' || data.event === 'SEND') {
        const d = data.data as Record<string, unknown> | undefined
        sessionData = {
          wabaId: (d?.waba_id as string) ?? '',
          phoneNumberId: (d?.phone_number_id as string) ?? '',
        }
        tryResolve()
      }
    }

    window.addEventListener('message', handleMessage)

    // Abre o popup de Embedded Signup
    window.FB.login(
      response => {
        if (response.authResponse?.code) {
          authCode = response.authResponse.code
          tryResolve()
        } else if (!response.authResponse) {
          clearTimeout(timeout)
          window.removeEventListener('message', handleMessage)
          reject(new Error('Autorização negada ou cancelada.'))
        }
      },
      {
        config_id: process.env.NEXT_PUBLIC_META_CONFIG_ID!,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: 3 },
      },
    )
  })
}
