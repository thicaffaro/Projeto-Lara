/**
 * GET /api/dashboard/conversations?tab=waiting|lara|recent&search=...
 * Retorna lista de conversas para as 3 sub-abas.
 * Usa raw SQL para queries com LATERAL JOIN (não suportado no Supabase JS builder).
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url    = new URL(req.url)
  const tab    = url.searchParams.get('tab') ?? 'waiting'
  const search = url.searchParams.get('search') ?? ''
  const { professionalId } = session
  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  if (tab === 'waiting') {
    // Sub-aba "Aguardando você": última msg inbound sem resposta da profissional
    const { data: rawContacts } = await supabase
      .from('contacts')
      .select('id, name, phone_number, contact_type, lara_mode, is_vip')
      .eq('professional_id', professionalId)
      .eq('is_blocked', false)

    if (!rawContacts) return NextResponse.json({ conversations: [] })

    type ContactRow = { id: string; name: string | null; phone_number: string; contact_type: string; lara_mode: string; is_vip: boolean }
    const contactIds = (rawContacts as unknown as ContactRow[]).map(c => c.id)
    if (contactIds.length === 0) return NextResponse.json({ conversations: [] })

    // Get last message per contact
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('id, contact_id, content, direction, sent_by, lara_mode_decision, created_at, read_by_professional_at')
      .in('contact_id', contactIds)
      .not('contact_id', 'is', null)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })

    type MsgRow = { id: string; contact_id: string; content: string | null; direction: string; sent_by: string | null; lara_mode_decision: string | null; created_at: string; read_by_professional_at: string | null }
    const msgs = (lastMsgs ?? []) as unknown as MsgRow[]

    // Build map: contactId -> last message
    const lastByContact = new Map<string, MsgRow>()
    for (const m of msgs) {
      if (!lastByContact.has(m.contact_id)) lastByContact.set(m.contact_id, m)
    }

    // Build map: contactId -> has professional reply after last inbound
    const professionalReplies = new Set<string>()
    for (const m of msgs) {
      if (m.sent_by === 'professional') professionalReplies.add(m.contact_id)
    }

    const conversations = (rawContacts as unknown as ContactRow[])
      .map(c => {
        const last = lastByContact.get(c.id)
        if (!last) return null
        if (last.direction !== 'inbound') return null
        if (professionalReplies.has(c.id)) {
          // Check if professional replied AFTER last inbound
          const proReply = msgs.find(m => m.contact_id === c.id && m.sent_by === 'professional' && m.created_at > last.created_at)
          if (proReply) return null
        }
        return { ...c, last_message: last.content, last_message_at: last.created_at, direction: last.direction, sent_by: last.sent_by, lara_mode_decision: last.lara_mode_decision, unread: !last.read_by_professional_at }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a!.last_message_at).getTime() - new Date(b!.last_message_at).getTime())

    return NextResponse.json({ conversations, count: conversations.length })
  }

  if (tab === 'lara') {
    // Sub-aba "Lara cuidando": lara_mode in full/booking_only, última msg sent_by='lara'
    const { data: rawContacts } = await supabase
      .from('contacts')
      .select('id, name, phone_number, contact_type, lara_mode, is_vip')
      .eq('professional_id', professionalId)
      .eq('is_blocked', false)
      .in('lara_mode', ['full', 'booking_only'])

    type ContactRow = { id: string; name: string | null; phone_number: string; contact_type: string; lara_mode: string; is_vip: boolean }
    if (!rawContacts || rawContacts.length === 0) return NextResponse.json({ conversations: [] })

    const contactIds = (rawContacts as unknown as ContactRow[]).map(c => c.id)
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('id, contact_id, content, direction, sent_by, created_at')
      .in('contact_id', contactIds)
      .not('contact_id', 'is', null)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })

    type MsgRow2 = { id: string; contact_id: string; content: string | null; direction: string; sent_by: string | null; created_at: string }
    const lastByContact = new Map<string, MsgRow2>()
    for (const m of (lastMsgs ?? []) as unknown as MsgRow2[]) {
      if (!lastByContact.has(m.contact_id)) lastByContact.set(m.contact_id, m)
    }

    const conversations = (rawContacts as unknown as ContactRow[])
      .map(c => {
        const last = lastByContact.get(c.id)
        if (!last || last.sent_by !== 'lara') return null
        return { ...c, last_message: last.content, last_message_at: last.created_at, direction: last.direction, sent_by: last.sent_by }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.last_message_at).getTime() - new Date(a!.last_message_at).getTime())

    return NextResponse.json({ conversations })
  }

  // tab === 'recent': todas conversas dos últimos 30 dias
  let query = supabase
    .from('contacts')
    .select('id, name, phone_number, contact_type, lara_mode, is_vip, last_message_at')
    .eq('professional_id', professionalId)
    .eq('is_blocked', false)
    .not('last_message_at', 'is', null)
    .gte('last_message_at', thirtyDaysAgo)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`)
  }

  const { data: contacts } = await query

  type ContactWithLastMsg = { id: string; name: string | null; phone_number: string; contact_type: string; lara_mode: string; is_vip: boolean; last_message_at: string | null }
  const contactList = (contacts ?? []) as unknown as ContactWithLastMsg[]

  // Get last message content for each
  const contactIds = contactList.map(c => c.id)
  const { data: lastMsgs } = contactIds.length > 0
    ? await supabase
        .from('messages')
        .select('contact_id, content, direction, sent_by')
        .in('contact_id', contactIds)
        .not('contact_id', 'is', null)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
    : { data: [] }

  type LastMsg = { contact_id: string; content: string | null; direction: string; sent_by: string | null }
  const lastByContact = new Map<string, LastMsg>()
  for (const m of (lastMsgs ?? []) as unknown as LastMsg[]) {
    if (!lastByContact.has(m.contact_id)) lastByContact.set(m.contact_id, m)
  }

  const conversations = contactList.map(c => {
    const last = lastByContact.get(c.id)
    return { ...c, last_message: last?.content ?? null, direction: last?.direction ?? null, sent_by: last?.sent_by ?? null }
  })

  return NextResponse.json({ conversations })
}
