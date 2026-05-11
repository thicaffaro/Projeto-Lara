/**
 * POST /api/dashboard/messages/send
 * Envia mensagem da profissional para o contato via Cloud API.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage, getProfessionalToken } from '@/lib/whatsapp'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    contactId?: string; text?: string; contactPhoneNumber?: string
  }
  const { contactId, text, contactPhoneNumber } = body

  if (!contactId || !text?.trim() || !contactPhoneNumber) {
    return NextResponse.json({ error: 'contactId, text e contactPhoneNumber obrigatórios' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verifica que contato pertence à profissional
  const { data: rawContact } = await supabase
    .from('contacts')
    .select('id, lara_mode')
    .eq('id', contactId)
    .eq('professional_id', session.professionalId)
    .single()

  type ContactRow = { id: string; lara_mode: string }
  const contact = rawContact as unknown as ContactRow | null
  if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })

  // Busca dados da profissional
  const { data: rawProf } = await supabase
    .from('professionals')
    .select('meta_phone_number_id')
    .eq('id', session.professionalId)
    .single()

  const prof = rawProf as unknown as { meta_phone_number_id: string | null } | null
  if (!prof?.meta_phone_number_id) {
    return NextResponse.json({ error: 'WhatsApp não conectado' }, { status: 400 })
  }

  // Verifica janela 24h
  const { data: isWithin } = await supabase
    .rpc('is_within_meta_window', { p_contact_id: contactId })

  if (!isWithin) {
    return NextResponse.json({ error: 'window_expired' }, { status: 422 })
  }

  // Decriptografa token e envia
  let accessToken: string
  try {
    accessToken = await getProfessionalToken(session.professionalId)
  } catch {
    return NextResponse.json({ error: 'Falha de autenticação WhatsApp' }, { status: 500 })
  }

  try {
    await sendTextMessage(
      prof.meta_phone_number_id,
      accessToken,
      contactPhoneNumber,
      text.trim(),
      session.professionalId,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar'
    return NextResponse.json({ error: msg }, { status: 502 })
  } finally {
    ;(accessToken as any) = null
  }

  // Salva em messages
  await supabase.from('messages').insert({
    professional_id: session.professionalId,
    contact_id:      contactId,
    direction:       'outbound',
    content:         text.trim(),
    message_type:    'text',
    sent_by:         'professional',
    channel:         'whatsapp',
  })

  // Cria handover se lara_mode != 'silent' e não há handover ativo
  if (contact.lara_mode !== 'silent') {
    const { data: activeHandover } = await supabase
      .from('human_handovers')
      .select('id')
      .eq('contact_id', contactId)
      .eq('status', 'active')
      .maybeSingle()

    if (!activeHandover) {
      await supabase.from('human_handovers').insert({
        contact_id:      contactId,
        professional_id: session.professionalId,
        status:          'active',
        context:         { reason: 'professional_replied_in_dashboard' },
      })
    }
  }

  // Atualiza last_message_at
  await supabase
    .from('contacts')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', contactId)

  return NextResponse.json({ ok: true })
}
