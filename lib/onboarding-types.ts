/**
 * /lib/onboarding-types.ts
 * Tipos compartilhados do onboarding de 7 passos.
 * Usados por SetupStepper, API routes e forms individuais.
 *
 * FORMATO working_hours:
 *   Chaves ISO numéricas ('1'=Segunda...'7'=Domingo) compatíveis com
 *   TO_CHAR(timestamp, 'ID') em is_slot_available (Postgres).
 *   Valor: array de TimeWindow ou null (dia fechado).
 *   Ver /lib/working-hours.ts para helpers de conversão e serialização.
 *
 * ANTES (com circular import):
 *   export type { WorkingHoursISO as WorkingHours } from './working-hours'
 *   import type { WeekdayISO } from './working-hours'  ← segunda importação = conflito
 *   workingHours: WorkingHours  ← WorkingHours não resolve como binding local
 *
 * DEPOIS (import único no topo, uso direto, re-export separado):
 *   import { WeekdayISO, WorkingHoursISO, ... } from './working-hours'
 *   workingHours: WorkingHoursISO  ← resolve corretamente
 */

// ── Import único de working-hours (sem duplicar a origem) ─────────────────────
import type { WeekdayISO, WorkingHoursISO, TimeWindow } from './working-hours'
import {
  ISO_WEEKDAYS,
  WEEKDAY_LABELS,
  DEFAULT_TIME_WINDOW,
  findOverlap,
  serializeWorkingHours,
  deserializeWorkingHours,
} from './working-hours'

// ── Re-exports para consumidores externos (aliases públicos) ──────────────────
export type { WeekdayISO as WeekdayKey, TimeWindow, WorkingHoursISO as WorkingHours }
export {
  ISO_WEEKDAYS as WEEKDAYS_ISO,
  WEEKDAY_LABELS,
  DEFAULT_TIME_WINDOW,
  findOverlap,
  serializeWorkingHours,
  deserializeWorkingHours,
}

// ── Tipos de endereço ──────────────────────────────────────────────────────────

export interface StudioAddress {
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  zip_code: string
  lat?: number
  lng?: number
}

/** Áreas de atendimento por dia (apenas mode='home'). Chaves ISO idênticas a working_hours. */
export type ServiceAreas = Partial<Record<WeekdayISO, string[]>>

// ── Tipos de protocolo e contato ──────────────────────────────────────────────

export interface ProfessionalProtocol {
  name: string
  category: 'facial' | 'corporal' | 'complementar'
  duration_min: number
  price_brl: number
}

export interface PreRegisteredContact {
  name: string
  phone_number: string  // dígitos apenas
  contact_type: 'personal' | 'business'
}

// ── Estado do stepper ─────────────────────────────────────────────────────────

export interface TestResult {
  test: 'generic_message' | 'booking_simulation' | 'template_preview'
  /** true = ✅ passou, false = ❌ falhou, null = ainda não executado */
  passed: boolean | null
  /** ⚠️ resultado aceitável mas com observação */
  warning?: string
}

export interface SetupState {
  /** Índice do passo atual (0–6) */
  currentStep: number

  // Passo 1
  serviceMode: 'studio' | 'home' | null
  studioAddress: StudioAddress | null
  homeRadiusKm: number
  homeBufferMin: number

  // Passo 2 — WorkingHoursISO usado diretamente (import local resolve)
  workingHours: WorkingHoursISO

  // Passo 3 (condicional — só home)
  serviceAreasEnabled: boolean
  serviceAreas: ServiceAreas

  // Passo 4
  protocols: ProfessionalProtocol[]

  // Passo 5
  defaultLaraMode: 'cautious' | 'standard'
  preRegisteredContacts: PreRegisteredContact[]

  // Passo 6
  recoveryEmail: string

  // Passo 7
  testResults: TestResult[]
}

export const INITIAL_SETUP_STATE: SetupState = {
  currentStep: 0,
  serviceMode: null,
  studioAddress: null,
  homeRadiusKm: 15,
  homeBufferMin: 30,
  workingHours: {},
  serviceAreasEnabled: false,
  serviceAreas: {},
  protocols: [],
  defaultLaraMode: 'cautious',
  preRegisteredContacts: [],
  recoveryEmail: '',
  testResults: [
    { test: 'generic_message',    passed: null },
    { test: 'booking_simulation', passed: null },
    { test: 'template_preview',   passed: null },
  ],
}

// ── Actions do reducer ────────────────────────────────────────────────────────

export type SetupAction =
  | { type: 'GO_TO_STEP'; step: number }
  | { type: 'SET_SERVICE_MODE'; mode: 'studio' | 'home'; address?: StudioAddress; radiusKm?: number; bufferMin?: number }
  | { type: 'SET_WORKING_HOURS'; hours: WorkingHoursISO }
  | { type: 'SET_SERVICE_AREAS'; enabled: boolean; areas: ServiceAreas }
  | { type: 'SET_PROTOCOLS'; protocols: ProfessionalProtocol[] }
  | { type: 'SET_LARA_MODES'; defaultMode: 'cautious' | 'standard'; contacts: PreRegisteredContact[] }
  | { type: 'SET_RECOVERY_EMAIL'; email: string }
  | { type: 'SET_TEST_RESULT'; index: number; passed: boolean | null; warning?: string }
  | { type: 'LOAD_FROM_SERVER'; state: Partial<SetupState> }

export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case 'GO_TO_STEP':
      return { ...state, currentStep: action.step }

    case 'SET_SERVICE_MODE':
      return {
        ...state,
        serviceMode:   action.mode,
        studioAddress: action.address  ?? state.studioAddress,
        homeRadiusKm:  action.radiusKm ?? state.homeRadiusKm,
        homeBufferMin: action.bufferMin ?? state.homeBufferMin,
      }

    case 'SET_WORKING_HOURS':
      return { ...state, workingHours: action.hours }

    case 'SET_SERVICE_AREAS':
      return { ...state, serviceAreasEnabled: action.enabled, serviceAreas: action.areas }

    case 'SET_PROTOCOLS':
      return { ...state, protocols: action.protocols }

    case 'SET_LARA_MODES':
      return {
        ...state,
        defaultLaraMode:       action.defaultMode,
        preRegisteredContacts: action.contacts,
      }

    case 'SET_RECOVERY_EMAIL':
      return { ...state, recoveryEmail: action.email }

    case 'SET_TEST_RESULT':
      return {
        ...state,
        testResults: state.testResults.map((r, i) =>
          i === action.index
            ? { ...r, passed: action.passed, warning: action.warning }
            : r
        ),
      }

    case 'LOAD_FROM_SERVER':
      return { ...state, ...action.state }

    default:
      return state
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Retorna os índices de passo efetivos (considerando o pulo do passo 3 para studio).
 * Passo 3 (serviceAreas) só existe no fluxo mode='home'.
 */
export function getEffectiveSteps(serviceMode: 'studio' | 'home' | null): number[] {
  if (serviceMode === 'studio') {
    return [0, 1, 3, 4, 5, 6]  // pula índice 2 (service_areas)
  }
  return [0, 1, 2, 3, 4, 5, 6]
}

/** Passo exibido na UI ("Passo X de 7") — sempre 7, passo 3 é auto-concluído em studio */
export function getDisplayStep(internalIndex: number, serviceMode: 'studio' | 'home' | null): number {
  if (serviceMode === 'studio' && internalIndex >= 3) {
    return internalIndex + 1
  }
  return internalIndex + 1
}
