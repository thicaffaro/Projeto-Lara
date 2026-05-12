/**
 * POST /api/n8n/contact-classification
 * Cron diário às 3h (flow_contact_classification no n8n).
 *
 * Promove contacts com contact_type='unknown' → 'client' para contatos
 * que tiveram pelo menos 1 appointment nos últimos 7 dias.
 *
 * Estratégia: dois passos (Supabase JS não suporta subquery no .in()):
 *   1. Busca contact_ids com appointment recente
 *   2. Atualiza contacts com contact_type='unknown' nessa lista
 *
 * maxDuration: 30s — operações são simples SELECT + UPDATE bulk.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }        from '@/lib/supabase/admin'

export const maxDuration = 30

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Autenticação
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.N8N_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase   = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

  // ── Passo 1: IDs de contatos com appointment recente ─────────────────────
  const { data: recentAppointments, error: apptErr } = await supabase
    .from('appointments')
    .select('contact_id')
    .gte('starts_at', sevenDaysAgo)
    .not('contact_id', 'is', null)

  if (apptErr) {
    console.error('[contact-classification] query appointments:', apptErr.message)
    return NextResponse.json({ error: apptErr.message }, { status: 500 })
  }

  if (!recentAppointments || recentAppointments.length === 0) {
    return NextResponse.json({ promoted: 0, reason: 'no_recent_appointments' })
  }

  // Deduplica contact_ids
  const contactIds = [...new Set(
    (recentAppointments as unknown as { contact_id: string }[])
      .map(r => r.contact_id)
      .filter(Boolean)
  )]

  if (contactIds.length === 0) {
    return NextResponse.json({ promoted: 0, reason: 'no_contacts' })
  }

  // ── Passo 2: Promover unknown → client ────────────────────────────────────
  const { count, error: updateErr } = await supabase
    .from('contacts')
    .update({ contact_type: 'client' })
    .eq('contact_type', 'unknown')
    .in('id', contactIds)

  if (updateErr) {
    console.error('[contact-classification] update contacts:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const promoted = count ?? 0
  console.log('[contact-classification] promovidos:', promoted)

  return NextResponse.json({
    promoted,
    candidates: contactIds.length,
  })
}
