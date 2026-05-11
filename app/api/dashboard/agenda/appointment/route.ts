/**
 * PATCH /api/dashboard/agenda/appointment
 * Atualiza status de um appointment (cancelar, no_show, confirmar).
 * Requer confirmação dupla na UI — executada antes de chamar este endpoint.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_STATUSES = ['confirmed', 'cancelled', 'no_show'] as const
type AllowedStatus = typeof ALLOWED_STATUSES[number]

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { appointment_id?: string; status?: string }
  const { appointment_id, status } = body

  if (!appointment_id || !status || !ALLOWED_STATUSES.includes(status as AllowedStatus)) {
    return NextResponse.json({ error: 'appointment_id e status válido obrigatórios' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verifica que o appointment pertence a este profissional (RLS adicional)
  const { data: existing } = await supabase
    .from('appointments')
    .select('id, professional_id')
    .eq('id', appointment_id)
    .eq('professional_id', session.professionalId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointment_id)
    .eq('professional_id', session.professionalId)

  if (error) {
    console.error('[agenda/appointment] update error:', error.message)
    return NextResponse.json({ error: 'Falha ao atualizar.' }, { status: 500 })
  }

  // Audit log
  await supabase.from('audit_log').insert({
    professional_id: session.professionalId,
    actor: 'professional',
    action: `appointment_${status}`,
    table_name: 'appointments',
    record_id: appointment_id,
    new_data: { status },
  }).then(null, (e: Error) => console.error('[agenda/appointment] audit_log:', e.message))

  return NextResponse.json({ ok: true })
}
