/**
 * GET/PATCH /api/dashboard/lara/settings
 * Configurações gerais da profissional: lara_settings, is_paused, silent_hours,
 * default_lara_mode, whatsapp_status, service_mode, protocols, working_hours, service_areas
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

const SELECT_FIELDS = [
  'id', 'name', 'phone_number', 'specialty', 'service_mode', 'studio_address',
  'home_service_radius_km', 'home_service_buffer_min', 'service_areas',
  'working_hours', 'protocols', 'default_lara_mode', 'is_paused', 'silent_hours',
  'whatsapp_status', 'whatsapp_status_changed_at', 'meta_phone_number_id',
  'lara_settings', 'trial_started_at', 'trial_ends_at', 'billing_paused_at',
  'recovery_email', 'onboarding_completed',
].join(', ')

async function getSession() {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return null
  return validateDashboardSession(sessionToken)
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('professionals')
    .select(SELECT_FIELDS)
    .eq('id', session.professionalId)
    .single()

  // Also fetch personal contacts
  const { data: personalContacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number, lara_mode')
    .eq('professional_id', session.professionalId)
    .eq('contact_type', 'personal')
    .eq('is_blocked', false)
    .order('name')

  // Proactive rules
  const { data: proactiveRules } = await supabase
    .from('proactive_message_rules')
    .select('id, name, enabled, applicable_service_modes')
    .order('name')

  return NextResponse.json({ professional: data, personalContacts, proactiveRules })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const supabase = createAdminClient()

  // Only allow updating safe fields
  const ALLOWED = new Set([
    'lara_settings', 'is_paused', 'silent_hours', 'default_lara_mode',
    'service_mode', 'studio_address', 'home_service_radius_km', 'home_service_buffer_min',
    'service_areas', 'working_hours', 'protocols', 'recovery_email',
  ])

  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) update[k] = v
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('professionals')
    .update(update)
    .eq('id', session.professionalId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
