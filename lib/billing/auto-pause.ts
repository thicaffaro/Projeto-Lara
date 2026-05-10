/**
 * /lib/billing/auto-pause.ts
 * Pausa automática de cobrança para profissionais com token Meta inválido
 * há mais de 7 DIAS CONTÍNUOS.
 *
 * IDEMPOTÊNCIA GARANTIDA:
 *   O WHERE inclui `billing_paused_at IS NULL` — rodar 10x em sequência
 *   pausa apenas na 1ª vez. As próximas 9 não encontram nenhum resultado.
 *
 * JANELA CONTÍNUA (não acumulada):
 *   Usa whatsapp_status_changed_at, que é atualizado pelo trigger
 *   `trg_whatsapp_status_changed` toda vez que o status muda.
 *   Se profissional reconectou e voltou a falhar, a janela reinicia do 0.
 *
 * EXECUÇÃO:
 *   Chamada pelo cron job do n8n no Prompt E.
 *   Pode ser testada manualmente via script: tsx scripts/billing/check-pause.ts
 *
 * RETORNO:
 *   { processed: number, paused: number, failed: number }
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { pausePreapproval } from '@/lib/mercadopago'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

export interface PauseResult {
  processed: number
  paused: number
  failed: number
}

// 7 dias em milissegundos
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function checkAndPauseInvalidTokens(): Promise<PauseResult> {
  const supabase = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()

  // ── Busca profissionais elegíveis para pausa ───────────────────────────────
  // Condições (todas obrigatórias):
  //   1. whatsapp_status = 'token_invalid'
  //   2. whatsapp_status_changed_at < NOW() - 7 dias (continuo, não acumulado)
  //   3. billing_paused_at IS NULL (idempotência — não pausar 2x)
  //   4. subscription.status NOT IN ('cancelled', 'past_due')
  const { data: rawList, error: fetchErr } = await supabase
    .from('professionals')
    .select(`
      id,
      phone_number,
      name,
      subscriptions (
        id,
        mp_subscription_id,
        status
      )
    `)
    .eq('whatsapp_status', 'token_invalid')
    .lt('whatsapp_status_changed_at', sevenDaysAgo)
    .is('billing_paused_at', null)

  if (fetchErr || !rawList) {
    console.error('[auto-pause] Falha ao buscar elegíveis:', fetchErr?.message)
    return { processed: 0, paused: 0, failed: 0 }
  }

  type ProfRow = {
    id: string
    phone_number: string
    name: string
    subscriptions: Array<{ id: string; mp_subscription_id: string | null; status: string }>
  }

  // Filtra profissionais com subscription elegível (não cancelada nem já em past_due)
  const eligible = (rawList as unknown as ProfRow[]).filter(p => {
    const sub = p.subscriptions?.[0]
    return sub?.mp_subscription_id && !['cancelled', 'past_due'].includes(sub.status)
  })

  const result: PauseResult = { processed: eligible.length, paused: 0, failed: 0 }

  console.log(`[auto-pause] ${eligible.length} profissional(is) elegível(is) para pausa.`)

  // ── Processa cada profissional individualmente ────────────────────────────
  for (const professional of eligible) {
    const sub = professional.subscriptions[0]
    const professionalId = professional.id

    try {
      // 1. Pausa no Mercado Pago
      await pausePreapproval(sub.mp_subscription_id!)

      // 2. Registra billing_paused_at (impede 2ª pausa pela idempotência no WHERE)
      await supabase
        .from('professionals')
        .update({ billing_paused_at: new Date().toISOString() })
        .eq('id', professionalId)

      // 3. Atualiza status da subscription
      await supabase
        .from('subscriptions')
        .update({ status: 'past_due', mp_paused_at: new Date().toISOString() })
        .eq('id', sub.id)

      // 4. Notifica profissional via WhatsApp (Canal 1 — LARA_OFFICIAL_PHONE)
      sendFromOfficialNumber(
        professional.phone_number,
        `💛 Pausamos sua cobrança porque sua conexão com a Meta expirou há mais de 7 dias. ` +
        `Reconecte para retomar o serviço sem custo: ` +
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/lara`,
      ).catch((e: Error) =>
        console.error('[auto-pause] Notificação WhatsApp falhou:', e.message, 'professional:', professionalId)
      )

      // 5. Audit log
      await supabase.from('audit_log').insert({
        professional_id: professionalId,
        actor: 'system',
        action: 'billing_paused_token_invalid',
        new_data: {
          mp_subscription_id: sub.mp_subscription_id,
          days_invalid: 7,
        },
      }).then(null, (e: Error) =>
        console.error('[auto-pause] audit_log falhou:', e.message, 'professional:', professionalId)
      )

      result.paused++
      console.log(`[auto-pause] Pausado — professional: ${professionalId}`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      result.failed++

      console.error('[auto-pause] Falha ao pausar professional:', professionalId, ':', msg)

      // Audit log da falha — para rastreamento e retry manual
      await supabase.from('audit_log').insert({
        professional_id: professionalId,
        actor: 'system',
        action: 'billing_pause_failed',
        new_data: {
          mp_subscription_id: sub.mp_subscription_id,
          error: msg,
        },
      }).then(null, (e: Error) =>
        console.error('[auto-pause] audit_log (falha) falhou:', e.message)
      )
      // Continua para o próximo — não para o batch inteiro
    }
  }

  console.log(
    `[auto-pause] Concluído — processados: ${result.processed}, ` +
    `pausados: ${result.paused}, falhos: ${result.failed}`
  )

  return result
}
