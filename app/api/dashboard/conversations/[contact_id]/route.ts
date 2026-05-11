/**
 * GET /api/dashboard/conversations/[contact_id]?offset=0
 * Retorna mensagens paginadas + info do contato + estado de handover.
 * 30 mensagens por página, ordem decrescente (mais recentes primeiro).
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: Promise<{ contact_id: string }> }

export async function GET(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { contact_id } = await params
  const offset  = parseInt(new URL(req.url).searchParams.get('offset') ?? '0', 10)
  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  // Verifica que o contato pertence a esta profissional
  const { data: rawContact } = await supabase
    .from('contacts')
    .select('id, name, phone_number, contact_type, lara_mode, notes, is_vip, is_blocked, address')
    .eq('id', contact_id)
    .eq('professional_id', session.professionalId)
    .single()

  if (!rawContact) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Busca mensagens paginadas (mais recentes primeiro)
  const { data: messages } = await supabase
    .from('messages')
    .select('id, content, direction, sent_by, lara_mode_decision, created_at, read_by_professional_at, message_type, media_url')
    .eq('contact_id', contact_id)
    .not('contact_id', 'is', null)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .range(offset, offset + 29)

  // Handover ativo?
  const { data: handover } = await supabase
    .from('human_handovers')
    .select('id, status, started_at')
    .eq('contact_id', contact_id)
    .eq('status', 'active')
    .maybeSingle()

  // Verifica janela Meta
  const { data: withinWindow } = await supabase
    .rpc('is_within_meta_window', { p_contact_id: contact_id })

  return NextResponse.json({
    contact: rawContact,
    messages: (messages ?? []).reverse(), // devolver em ordem crescente para UI
    has_active_handover: !!handover,
    handover_id: (handover as unknown as { id?: string } | null)?.id ?? null,
    is_within_meta_window: Boolean(withinWindow),
    has_more: (messages ?? []).length === 30,
  })
}
