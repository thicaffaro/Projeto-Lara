'use client'

/**
 * SetupStepper.tsx
 * Stepper de 7 passos do onboarding pós-conexão.
 *
 * Passos:
 *  0: ServiceModeForm  — modo de atendimento (studio ou home)
 *  1: WorkingHoursForm — horários por dia da semana
 *  2: ServiceAreasForm — regiões por dia (CONDICIONAL: só home)
 *  3: ProtocolsForm    — catálogo de protocolos + preços
 *  4: LaraModesSetupForm — comportamento padrão + contatos silenciosos
 *  5: RecoveryEmailForm  — email de recuperação de acesso
 *  6: SetupTestStep    — 3 micro-testes end-to-end
 *
 * Estado gerenciado via useReducer, persistido via PATCH /api/onboarding/state
 * após cada passo. Se a profissional fechar e voltar, retoma de onde parou.
 *
 * Passo 3 (service_areas) é pulado automaticamente em modo='studio'.
 * "Voltar" preserva o estado sem re-requisitar o banco.
 *
 * JWT REFRESH (Ajuste 3):
 * Após o passo 7 (onboarding_completed=true), a API atualiza user_metadata no
 * Supabase Auth. O JWT atual ainda tem onboarding_completed=false. Ao receber
 * refreshSession:true na resposta, chamamos supabase.auth.refreshSession()
 * antes de navegar para /complete — garante que o middleware não redirecionará
 * de volta para /onboarding/setup.
 */

import { useReducer, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  setupReducer,
  INITIAL_SETUP_STATE,
  getEffectiveSteps,
  type SetupState,
} from '@/lib/onboarding-types'
import type { StudioAddress, WorkingHours, ServiceAreas, ProfessionalProtocol, PreRegisteredContact, TestResult } from '@/lib/onboarding-types'
import { ServiceModeForm }       from '@/components/forms/ServiceModeForm'
import { WorkingHoursForm }      from '@/components/forms/WorkingHoursForm'
import { ServiceAreasForm }      from '@/components/forms/ServiceAreasForm'
import { ProtocolsForm }         from '@/components/forms/ProtocolsForm'
import { LaraModesSetupForm }    from '@/components/forms/LaraModesSetupForm'
import { RecoveryEmailForm }     from '@/components/forms/RecoveryEmailForm'
import { SetupTestStep }         from './SetupTestStep'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SetupStepperProps {
  professionalId: string
  initialState?: Partial<SetupState>
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STEP_TITLES = [
  'Modo de atendimento',
  'Horários de atendimento',
  'Regiões de atendimento',
  'Seus protocolos',
  'Como a Lara se comporta',
  'Email de recuperação',
  'Teste de configuração',
]

const STEP_DESCRIPTIONS = [
  'Studio fixo ou atendimento em domicílio?',
  'Configure dias e horários disponíveis.',
  'Organize atendimentos por bairro (opcional).',
  'Quais protocolos você oferece e a que preço?',
  'Como a Lara trata contatos novos e pessoais.',
  'Um canal de recuperação caso perca o acesso.',
  'Vamos testar se tudo está funcionando.',
]

// ── Helper: persiste passo no banco ──────────────────────────────────────────

async function persistStep(params: {
  professionalId: string
  step: number
  professionals?: Record<string, unknown>
  contacts?: PreRegisteredContact[]
  auditEvent?: string
}): Promise<void> {
  await fetch('/api/onboarding/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      professionalId: params.professionalId,
      step: params.step,
      professionals: params.professionals,
      contacts: params.contacts,
      auditEvent: params.auditEvent,
    }),
  })
}

// ── Componente: barra de progresso ────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Passo ${current + 1} de ${total}`}
      className="h-1.5 w-full rounded-full bg-gray-200"
    >
      <div
        className="h-1.5 rounded-full bg-rose-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function SetupStepper({ professionalId, initialState }: SetupStepperProps) {
  const router = useRouter()
  const shouldReduceMotion = useReducedMotion()

  const [state, dispatch] = useReducer(
    setupReducer,
    { ...INITIAL_SETUP_STATE, ...initialState },
  )

  const { currentStep } = state
  const effectiveSteps  = getEffectiveSteps(state.serviceMode)
  const TOTAL_STEPS     = 7
  const isStudio        = state.serviceMode === 'studio'

  // ── Navegação ─────────────────────────────────────────────────────────────

  function goBack() {
    const pos = effectiveSteps.indexOf(currentStep)
    if (pos > 0) dispatch({ type: 'GO_TO_STEP', step: effectiveSteps[pos - 1] })
  }

  const advance = useCallback((nextStep: number) => {
    dispatch({ type: 'GO_TO_STEP', step: nextStep })
  }, [])

  // ── Handlers por passo ────────────────────────────────────────────────────

  async function handleServiceMode(data: {
    serviceMode: 'studio' | 'home'
    studioAddress?: StudioAddress
    homeRadiusKm?: number
    homeBufferMin?: number
  }) {
    dispatch({ type: 'SET_SERVICE_MODE', ...data })
    await persistStep({
      professionalId,
      step: 0,
      professionals: {
        service_mode: data.serviceMode,
        ...(data.studioAddress    ? { studio_address: data.studioAddress }                : {}),
        ...(data.homeRadiusKm     ? { home_service_radius_km: data.homeRadiusKm }         : {}),
        ...(data.homeBufferMin    ? { home_service_buffer_min: data.homeBufferMin }       : {}),
      },
    })
    advance(1)
  }

  async function handleWorkingHours(hours: WorkingHours) {
    dispatch({ type: 'SET_WORKING_HOURS', hours })
    await persistStep({
      professionalId,
      step: 1,
      professionals: { working_hours: hours },
    })
    // Passo 3 é condicional: pula para 3 (protocolos) se studio
    advance(isStudio ? 3 : 2)
  }

  async function handleServiceAreas(data: { enabled: boolean; areas: ServiceAreas }) {
    dispatch({ type: 'SET_SERVICE_AREAS', ...data })
    await persistStep({
      professionalId,
      step: 2,
      professionals: { service_areas: data.enabled ? data.areas : null },
    })
    advance(3)
  }

  async function handleProtocols(protocols: ProfessionalProtocol[]) {
    dispatch({ type: 'SET_PROTOCOLS', protocols })
    await persistStep({
      professionalId,
      step: 3,
      professionals: { protocols },
    })
    advance(4)
  }

  async function handleLaraModes(data: {
    defaultLaraMode: 'cautious' | 'standard'
    contacts: PreRegisteredContact[]
  }) {
    dispatch({ type: 'SET_LARA_MODES', defaultMode: data.defaultLaraMode, contacts: data.contacts })
    await persistStep({
      professionalId,
      step: 4,
      professionals: { default_lara_mode: data.defaultLaraMode },
      contacts: data.contacts,
    })
    advance(5)
  }

  async function handleRecoveryEmail(email: string) {
    dispatch({ type: 'SET_RECOVERY_EMAIL', email })
    await persistStep({
      professionalId,
      step: 5,
      professionals: { recovery_email: email || null },
    })
    advance(6)
  }

  async function handleSkipRecoveryEmail() {
    await persistStep({
      professionalId,
      step: 5,
      auditEvent: 'recovery_email_skipped',
    })
    advance(6)
  }

  async function handleTestComplete(testResults: TestResult[]) {
    const allOk = testResults.every(r => r.passed === true || (r.passed === false && r.warning))
    if (!allOk) return // botão de conclusão só aparece quando allDone

    const res = await fetch('/api/onboarding/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professionalId,
        step: 6,
        professionals: { onboarding_completed: true },
        auditEvent: 'onboarding_completed',
      }),
    })

    const json = await res.json().catch(() => ({}))

    // CRÍTICO: refrescar JWT antes de navegar para /complete.
    // Sem isso, o middleware lê onboarding_completed=false do JWT antigo
    // e redireciona de volta para /onboarding/setup (loop infinito).
    if (json.refreshSession) {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      await supabase.auth.refreshSession()
    }

    router.push('/onboarding/setup/complete')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const displayStep = effectiveSteps.indexOf(currentStep) + 1
  const canGoBack   = displayStep > 1

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      {/* Header do stepper */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-400">
            Passo {displayStep} de {TOTAL_STEPS}
          </p>
          {/* Passo 3 auto-concluído para studio */}
          {isStudio && currentStep >= 3 && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              Passo 3 auto-concluído ✓
            </span>
          )}
        </div>

        <ProgressBar current={displayStep - 1} total={TOTAL_STEPS} />

        <div>
          <h1 className="text-lg font-bold text-gray-900">
            {STEP_TITLES[currentStep]}
          </h1>
          <p className="text-sm text-gray-500">{STEP_DESCRIPTIONS[currentStep]}</p>
        </div>
      </div>

      {/* Botão Voltar */}
      {canGoBack && (
        <button
          onClick={goBack}
          className="mb-4 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
          aria-label="Voltar para o passo anterior"
        >
          ← Voltar
        </button>
      )}

      {/* Conteúdo do passo atual */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : -20 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        >
          {currentStep === 0 && (
            <ServiceModeForm
              initial={{
                serviceMode: state.serviceMode,
                studioAddress: state.studioAddress,
                homeRadiusKm: state.homeRadiusKm,
                homeBufferMin: state.homeBufferMin,
              }}
              onSave={handleServiceMode}
            />
          )}

          {currentStep === 1 && (
            <WorkingHoursForm
              initial={state.workingHours}
              onSave={handleWorkingHours}
            />
          )}

          {currentStep === 2 && (
            <ServiceAreasForm
              initial={{ enabled: state.serviceAreasEnabled, areas: state.serviceAreas }}
              workingHours={state.workingHours as Record<string, unknown>}
              onSave={handleServiceAreas}
              onSkip={() => handleServiceAreas({ enabled: false, areas: {} })}
            />
          )}

          {currentStep === 3 && (
            <ProtocolsForm
              initial={state.protocols}
              onSave={handleProtocols}
            />
          )}

          {currentStep === 4 && (
            <LaraModesSetupForm
              initial={{
                defaultLaraMode: state.defaultLaraMode,
                preRegisteredContacts: state.preRegisteredContacts,
              }}
              onSave={handleLaraModes}
              onSkipContacts={() => handleLaraModes({
                defaultLaraMode: state.defaultLaraMode,
                contacts: state.preRegisteredContacts,
              })}
            />
          )}

          {currentStep === 5 && (
            <RecoveryEmailForm
              initial={state.recoveryEmail}
              onSave={handleRecoveryEmail}
              onSkip={handleSkipRecoveryEmail}
            />
          )}

          {currentStep === 6 && (
            <SetupTestStep
              professionalId={professionalId}
              initial={state.testResults}
              onComplete={handleTestComplete}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
