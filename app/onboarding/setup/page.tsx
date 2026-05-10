/**
 * /app/onboarding/setup/page.tsx
 * Página do onboarding pós-conexão — 7 passos de configuração.
 *
 * Server Component: busca o estado atual do profissional para inicializar
 * o SetupStepper com os dados já salvos (suporte a retomada de sessão).
 *
 * Acesso via:
 * - Redirect de /api/onboarding/verify-code (após etapa 6 do Embedded Signup)
 * - Redirect do middleware ao tentar acessar /dashboard com onboarding_completed=false
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { SetupStepper } from '@/components/onboarding/SetupStepper'
import type { SetupState } from '@/lib/onboarding-types'

export default async function OnboardingSetupPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/cadastro')

  // Busca estado atual do profissional para inicializar o stepper
  const { data: professional } = await supabase
    .from('professionals')
    .select([
      'id',
      'onboarding_completed',
      'service_mode',
      'studio_address',
      'home_service_radius_km',
      'home_service_buffer_min',
      'working_hours',
      'service_areas',
      'protocols',
      'default_lara_mode',
      'recovery_email',
    ].join(', '))
    .eq('auth_user_id', user.id)
    .single()

  if (!professional) redirect('/cadastro')
  if (professional.onboarding_completed) redirect('/dashboard')

  // Busca contatos pré-cadastrados (passo 5)
  const { data: preContacts } = await supabase
    .from('contacts')
    .select('name, phone_number, contact_type')
    .eq('professional_id', professional.id)
    .eq('pre_registered', true)
    .in('contact_type', ['personal', 'business'])

  // Mapeia estado do banco para o formato do SetupStepper
  const initialState: Partial<SetupState> = {
    serviceMode:           professional.service_mode ?? null,
    studioAddress:         professional.studio_address ?? null,
    homeRadiusKm:          professional.home_service_radius_km ?? 15,
    homeBufferMin:         professional.home_service_buffer_min ?? 30,
    workingHours:          professional.working_hours ?? {},
    serviceAreasEnabled:   !!professional.service_areas,
    serviceAreas:          professional.service_areas ?? {},
    protocols:             professional.protocols ?? [],
    defaultLaraMode:       professional.default_lara_mode ?? 'cautious',
    preRegisteredContacts: (preContacts ?? []).map(c => ({
      name: c.name ?? '',
      phone_number: c.phone_number,
      contact_type: c.contact_type as 'personal' | 'business',
    })),
    recoveryEmail: '',
    // currentStep é determinado pelo progresso atual
    currentStep: deriveCurrentStep(professional),
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <SetupStepper
        professionalId={professional.id}
        initialState={initialState}
      />
    </main>
  )
}

/** Determina o passo atual com base nos campos preenchidos */
function deriveCurrentStep(professional: Record<string, unknown>): number {
  if (!professional.service_mode) return 0
  if (!professional.working_hours || Object.keys(professional.working_hours as object).length === 0) return 1
  // Passo 2 (service_areas) apenas para home — se já passou, está em 3+
  if (professional.service_mode === 'home' && professional.service_areas === undefined) return 2
  if (!professional.protocols || (professional.protocols as unknown[]).length === 0) return 3
  if (!professional.default_lara_mode) return 4
  // Passo 6 (recovery_email) é opcional, pode pular
  return 5
}
