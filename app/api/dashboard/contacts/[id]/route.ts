/**
 * GET/PATCH /api/dashboard/contacts/[id]
 * Detalhe e atualização de contato.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: Promise<{ id: string }> }

async function getSession() {
  const cs = await cookies()
  const t  = cs.get(COOKIE_NAME)?.value
  if (!t) return null
  return validateDashboardSession(t)
}

export async function GET(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .eq('professional_id', session.professionalId)
    .single()

  if (!contact) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Appointments do contato
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, protocol_name, starts_at, ends_at, status, service_location')
    .eq('contact_id', id)
    .order('starts_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ contact, appointments: appointments ?? [] })
}

export async function PATCH(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const ALLOWED = new Set(['name', 'contact_type', 'lara_mode', 'is_blocked', 'is_vip', 'notes', 'address'])
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) update[k] = v
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contacts')
    .update(update)
    .eq('id', id)
    .eq('professional_id', session.professionalId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
