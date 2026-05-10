/**
 * /lib/billing/auto-resume.ts
 * Retomada automática de cobrança quando profissional reconecta com sucesso.
 *
 * CHAMADA POR:
 *   /app/api/onboarding/reconnect/route.ts — após whatsapp_status='connected'
 *
 * IDEMPOTÊNCIA:
 *   Verifica billing_paused_at IS NOT NULL antes de agir.
 *   Se já estiver NULL (não estava pausada), retorna sem ação.
 *
 * DEGRADAÇÃO GRACEFUL:
 *   Lançada de forma fire-and-forget no reconnect — falha de MP não bloqueia
 *   a resposta de reconexão da profissional.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { resumePreapproval } from '@/lib/mercadopago'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

export async function resumeBillingForProfessional(
  professionalId: string,
): Promise<void> {
  const supabase = createAdminClient()

  // ── Busca dados necessários ───────────────────────────────────────────────
  const { data: rawProf } = await supabase
    .from('professionals')
    .select(`
      id,
      phone_number,
      name,
      billing_paused_at,
      subscriptions (
        id,
        mp_subscription_id,
        status
      )
    `)
    .eq('id', professionalId)
    .single()

  type ProfRow = {
    id: string
    phone_number: string
    name: string
    billing_paused_at: string | null
    subscriptions: Array<{ id: string; mp_subscription_id: string | null; status: string }>
  }

  const professional = rawProf as unknown as ProfRow | null

  if (!professional) {
    console.warn('[auto-resume] Profissional não encontrado:', professionalId)
    return
  }

  // Não estava pausada — retorna sem ação (idempotência)
  if (!professional.billing_paused_at) {
    console.log('[auto-resume] billing_paused_at é NULL — sem ação:', professionalId)
    return
  }

  const sub = professional.subscriptions?.[0]

  if (!sub?.mp_subscription_id) {
    console.warn('[auto-resume] Sem mp_subscription_id para:', professionalId)
    // Limpa billing_paused_at mesmo sem MP para não travar a conta
    await supabase
      .from('professionals')
      .update({ billing_paused_at: null })
      .eq('id', professionalId)
    return
  }

  // ── Guarda de status da subscription ANTES de chamar o MP ────────────────
  //
  // CRÍTICO — previne cobrança indevida (risco Procon):
  //   Cenário: billing pausado → profissional cancela → meses depois reconecta
  //   Sem esta verificação: resumePreapproval reativaria assinatura cancelada
  //
  // Status esperado para retomada: 'past_due' (setado pelo auto-pause)
  // Status que bloqueiam retomada: 'cancelled', 'cancelled_pending_anonymization'

  if (sub.status === 'cancelled' || sub.status === 'cancelled_pending_anonymization') {
    console.log(
      `[auto-resume] Retomada bloqueada — subscription cancelada.`,
      'professional:', professionalId, 'status:', sub.status,
    )
    // Limpa billing_paused_at para não reaparece em verificações futuras,
    // mas NÃO retoma o MP (assinatura cancelada = sem cobrança)
    await supabase
      .from('professionals')
      .update({ billing_paused_at: null })
      .eq('id', professionalId)
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'system',
      action: 'billing_resume_skipped_cancelled',
      new_data: { subscription_status: sub.status },
    }).then(null, (e: Error) =>
      console.error('[auto-resume] audit_log (skipped_cancelled) falhou:', e.message)
    )
    return
  }

  // Status inesperado (nem past_due nem cancelled) — provavelmente inconsistência
  // de estado. Não retomar para não causar efeito colateral indesejado.
  if (sub.status !== 'past_due') {
    console.warn(
      `[auto-resume] Status inesperado '${sub.status}' — retomada bloqueada.`,
      'professional:', professionalId,
    )
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'system',
      action: 'billing_resume_skipped_unexpected_status',
      new_data: { subscription_status: sub.status },
    }).then(null, (e: Error) =>
      console.error('[auto-resume] audit_log (unexpected_status) falhou:', e.message)
    )
    return
  }

  // ── Status é 'past_due' — retomada é segura ───────────────────────────────
  try {
    await resumePreapproval(sub.mp_subscription_id)

    // Limpa billing_paused_at
    await supabase
      .from('professionals')
      .update({ billing_paused_at: null })
      .eq('id', professionalId)

    // Atualiza subscription para 'active'
    await supabase
      .from('subscriptions')
      .update({ status: 'active', mp_paused_at: null })
      .eq('id', sub.id)

    // Notifica profissional (Canal 1 — LARA_OFFICIAL_PHONE)
    sendFromOfficialNumber(
      professional.phone_number,
      `🎉 Sua cobrança foi retomada. Bom te ter de volta!`,
    ).catch((e: Error) =>
      console.error('[auto-resume] Notificação WhatsApp falhou:', e.message)
    )

    // Audit log
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'system',
      action: 'billing_resumed_token_recovered',
      new_data: { mp_subscription_id: sub.mp_subscription_id },
    }).then(null, (e: Error) =>
      console.error('[auto-resume] audit_log falhou:', e.message)
    )

    console.log(`[auto-resume] Cobrança retomada — professional: ${professionalId}`)

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido'
    console.error('[auto-resume] Falha ao retomar MP:', msg, 'professional:', professionalId)

    // Audit log da falha — profissional fica pausada, será retentada
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'system',
      action: 'billing_resume_failed',
      new_data: { mp_subscription_id: sub.mp_subscription_id, error: msg },
    }).then(null, (e: Error) =>
      console.error('[auto-resume] audit_log (falha) falhou:', e.message)
    )

    // Re-lança para o caller saber que falhou (fire-and-forget no reconnect)
    throw err
  }
}
