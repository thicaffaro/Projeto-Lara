/**
 * POST /api/legal/accept
 * Registra o aceite de um documento legal pelo profissional autenticado.
 *
 * Aceitar versão 2 NÃO invalida o aceite da versão 1 — histórico preservado.
 * ON CONFLICT DO NOTHING garante idempotência (aceitar 2x = sem efeito).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { doc_type, version_id } = (body ?? {}) as {
    doc_type?: string
    version_id?: string
  }

  if (!doc_type || !version_id) {
    return NextResponse.json({ error: 'doc_type e version_id obrigatórios' }, { status: 400 })
  }
  if (doc_type !== 'privacy_policy' && doc_type !== 'terms_of_use') {
    return NextResponse.json({ error: 'doc_type inválido' }, { status: 400 })
  }

  // ── Autentica ─────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseAdmin = createAdminClient()

  // ── Busca professional_id ────────────────────────────────────────────────
  const { data: rawProf } = await supabaseAdmin
    .from('professionals')
    .select('id, subscriptions(status)')
    .eq('auth_user_id', user.id)
    .single()

  const professional = rawProf as unknown as {
    id: string
    subscriptions: Array<{ status: string }>
  } | null

  if (!professional) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  // Profissional cancelado não precisa aceitar — retorna OK silencioso
  const subStatus = professional.subscriptions?.[0]?.status
  if (subStatus === 'cancelled' || subStatus === 'cancelled_pending_anonymization') {
    return NextResponse.json({ ok: true, skipped: 'cancelled' }, { status: 200 })
  }

  const professionalId = professional.id
  const now = new Date().toISOString()

  // ── Valida que o documento existe e já entrou em vigor ───────────────────
  const { data: rawDoc } = await supabaseAdmin
    .from('legal_documents')
    .select('id, doc_type, version, effective_at')
    .eq('id', version_id)
    .eq('doc_type', doc_type)
    .lte('effective_at', now)
    .maybeSingle()

  const doc = rawDoc as unknown as {
    id: string; doc_type: string; version: number; effective_at: string
  } | null

  if (!doc) {
    return NextResponse.json(
      { error: 'Documento não encontrado ou ainda não vigente.' },
      { status: 404 }
    )
  }

  // ── Registra aceite (ON CONFLICT DO NOTHING = idempotente) ───────────────
  const { error: insertErr } = await supabaseAdmin
    .from('professional_consents')
    .upsert(
      {
        professional_id:  professionalId,
        doc_type:         doc_type,
        legal_document_id: doc.id,
        accepted_at:      now,
      },
      { onConflict: 'professional_id,doc_type,legal_document_id', ignoreDuplicates: true }
    )

  if (insertErr) {
    console.error('[legal/accept] Falha ao inserir consent:', insertErr.message)
    return NextResponse.json({ error: 'Falha ao registrar aceite.' }, { status: 500 })
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  await supabaseAdmin.from('audit_log').insert({
    professional_id: professionalId,
    actor: 'professional',
    action: 'legal_doc_accepted',
    new_data: {
      doc_type,
      version: doc.version,
      legal_document_id: doc.id,
    },
  }).then(null, (e: Error) =>
    console.error('[legal/accept] audit_log falhou:', e.message)
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}
