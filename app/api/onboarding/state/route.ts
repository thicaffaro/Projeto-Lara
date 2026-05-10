/**
 * PATCH /api/onboarding/state
 * Persiste o estado parcial do onboarding após cada passo.
 *
 * Chamado pelo SetupStepper sempre que a esteticista avança um passo.
 * Idempotente: pode ser chamado múltiplas vezes para o mesmo passo.
 *
 * Corpo:
 *   - professionalId: string
 *   - step: número do passo concluído (0-6)
 *   - professionals: colunas a atualizar em professionals
 *   - contacts: contatos pré-cadastrados (criados em contacts com pre_registered=true)
 *   - auditEvent: string opcional para audit_log
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Tipos do body ─────────────────────────────────────────────────────────────

interface PatchStateBody {
  professionalId: string
  step: number
  professionals?: Record<string, unknown>
  contacts?: Array<{
    name: string
    phone_number: string
    contact_type: 'personal' | 'business'
  }>
  auditEvent?: string
}

function validateBody(body: unknown): body is PatchStateBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.professionalId === 'string' && b.professionalId.length > 0 &&
    typeof b.step === 'number' && b.step >= 0 && b.step <= 6
  )
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  if (!validateBody(body)) {
    return NextResponse.json({ error: 'professionalId e step são obrigatórios' }, { status: 400 })
  }

  const { professionalId, step, professionals, contacts, auditEvent } = body
  const supabase = createAdminClient()

  // ── Atualiza professionals ────────────────────────────────────────────────
  if (professionals && Object.keys(professionals).length > 0) {
    const { error } = await supabase
      .from('professionals')
      .update(professionals)
      .eq('id', professionalId)

    if (error) {
      console.error('[onboarding/state] Falha ao atualizar professionals:', error.message)
      return NextResponse.json({ error: 'Falha ao salvar. Tente novamente.' }, { status: 500 })
    }
  }

  // ── Cria contatos pré-cadastrados (passo 5) ───────────────────────────────
  if (contacts && contacts.length > 0) {
    const rows = contacts.map(c => ({
      professional_id: professionalId,
      name: c.name,
      phone_number: c.phone_number.replace(/\D/g, ''),
      contact_type: c.contact_type,
      lara_mode: 'silent' as const,
      pre_registered: true,
    }))

    const { error } = await supabase
      .from('contacts')
      .upsert(rows, { onConflict: 'professional_id,phone_number', ignoreDuplicates: false })

    if (error) {
      console.error('[onboarding/state] Falha ao criar contacts pré-cadastrados:', error.message)
      // Não bloqueia — contatos podem ser adicionados depois
    }
  }

  // ── Audit log opcional ────────────────────────────────────────────────────
  if (auditEvent) {
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'professional',
      action: auditEvent,
      new_data: { step },
    }).catch((e: Error) =>
      console.error('[onboarding/state] audit_log falhou:', e.message)
    )
  }

  // ── Se onboarding_completed=true, atualiza user_metadata no Supabase Auth ─
  // Permite que o middleware leia onboarding_completed sem query ao banco.
  // IMPORTANTE: o JWT da sessão atual ainda tem onboarding_completed=false
  // até o cliente chamar supabase.auth.refreshSession().
  // Sinalizado via refreshSession:true na resposta para o cliente fazer o refresh.
  let shouldRefreshSession = false

  if (professionals?.onboarding_completed === true) {
    const { data: prof } = await supabase
      .from('professionals')
      .select('auth_user_id')
      .eq('id', professionalId)
      .single()

    if (prof?.auth_user_id) {
      const { error: updateErr } = await supabase.auth.admin.updateUserById(
        prof.auth_user_id,
        { user_metadata: { onboarding_completed: true } },
      )
      if (updateErr) {
        console.error('[onboarding/state] updateUserById falhou:', updateErr.message)
      } else {
        // Sinaliza ao cliente para fazer refreshSession() antes de navegar
        shouldRefreshSession = true
      }
    }
  }

  return NextResponse.json({ ok: true, step, refreshSession: shouldRefreshSession }, { status: 200 })
}
