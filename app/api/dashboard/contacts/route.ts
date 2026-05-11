/**
 * GET  /api/dashboard/contacts?type=all|client|personal|business|unknown|blocked
 * POST /api/dashboard/contacts — adicionar contato manual
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

async function getSession() {
  const cookieStore  = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return validateDashboardSession(token)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const type    = new URL(req.url).searchParams.get('type') ?? 'all'
  const supabase = createAdminClient()

  let query = supabase
    .from('contacts')
    .select('id, name, phone_number, contact_type, lara_mode, is_blocked, is_vip, last_message_at, notes')
    .eq('professional_id', session.professionalId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (type === 'blocked') {
    query = query.eq('is_blocked', true)
  } else if (type !== 'all') {
    query = query.eq('contact_type', type).eq('is_blocked', false)
  } else {
    query = query.eq('is_blocked', false)
  }

  const { data } = await query
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    name?: string; phone_number?: string; contact_type?: string; lara_mode?: string
  }
  const { name, phone_number, contact_type = 'unknown', lara_mode = 'silent' } = body

  if (!phone_number?.trim()) return NextResponse.json({ error: 'Telefone obrigatório' }, { status: 400 })

  const digits = phone_number.replace(/\D/g, '')
  if (digits.length < 10) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })

  const supabase = createAdminClient()

  // Verifica unicidade por profissional
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('professional_id', session.professionalId)
    .or(`phone_number.eq.${digits},phone_number.eq.55${digits}`)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Esse número já existe nos seus contatos.' }, { status: 409 })

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      professional_id: session.professionalId,
      name: name?.trim() || null,
      phone_number: digits,
      contact_type,
      lara_mode,
      pre_registered: true,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as unknown as { id: string }).id }, { status: 201 })
}
