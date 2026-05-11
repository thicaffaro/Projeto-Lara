/**
 * /lib/ai/notificationRateLimit.ts
 * Notificação rate-limitada da Lara para a profissional.
 *
 * Quando a Lara não consegue responder sozinha (intent=SUPORTE, handover, etc.),
 * avisa a profissional via WhatsApp do número oficial (LARA_OFFICIAL_PHONE).
 *
 * Rate limit: 1 notificação por contato por hora.
 * Campo de controle: contacts.last_notification_at
 *
 * URL do painel: /d/{magicLinkToken} (rota curta → Prompt D)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'

export interface NotifyParams {
  contactId: string
  professionalId: string
  /** Nome do contato, ou null se desconhecido */
  contactName: string | null
  /** Número do contato para exibição fallback se sem nome */
  contactPhone: string
  /** Preview do conteúdo da mensagem (apenas para contexto na notificação) */
  messagePreview: string
  /** Token do magic link para acesso rápido ao painel */
  magicLinkToken: string
}

/**
 * Envia notificação para a profissional se o rate limit permitir.
 *
 * @returns 'sent' se enviou, 'rate_limited' se dentro do intervalo de 1h
 */
export async function notifyProfessionalIfAllowed(
  params: NotifyParams,
): Promise<'sent' | 'rate_limited'> {
  const {
    contactId,
    professionalId,
    contactName,
    contactPhone,
    magicLinkToken,
  } = params

  const supabase = createAdminClient()

  // ── Verifica rate limit via last_notification_at ──────────────────────────
  const { data: rawContact } = await supabase
    .from('contacts')
    .select('last_notification_at')
    .eq('id', contactId)
    .single()

  const contact = rawContact as unknown as { last_notification_at: string | null } | null

  if (contact?.last_notification_at) {
    const lastAt     = new Date(contact.last_notification_at)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    if (lastAt > oneHourAgo) {
      return 'rate_limited'
    }
  }

  // ── Busca telefone da profissional ────────────────────────────────────────
  const { data: rawProf } = await supabase
    .from('professionals')
    .select('phone_number')
    .eq('id', professionalId)
    .single()

  const professional = rawProf as unknown as { phone_number: string } | null

  if (!professional?.phone_number) {
    console.error('[notificationRateLimit] Telefone da profissional não encontrado:', professionalId)
    return 'rate_limited' // não bloqueia o fluxo, trata como rate limited
  }

  // ── Monta mensagem de notificação ─────────────────────────────────────────
  // Exibe nome se disponível, cai para últimos 4 dígitos do número
  const displayName = contactName?.trim()
    || `+${contactPhone.replace(/\D/g, '').slice(-4)}`

  const panelUrl = `${APP_URL}/d/${magicLinkToken}`

  const message = `🔔 ${displayName} te mandou mensagem. Esperando você no painel:\n${panelUrl}`

  // ── Envia via número oficial Lara → profissional ──────────────────────────
  try {
    await sendFromOfficialNumber(professional.phone_number, message)
  } catch (err) {
    console.error(
      '[notificationRateLimit] Falha ao enviar notificação:',
      err instanceof Error ? err.message : 'unknown',
    )
    // Não bloqueia — atualiza last_notification_at mesmo assim para evitar spam
  }

  // ── Atualiza last_notification_at ─────────────────────────────────────────
  await supabase
    .from('contacts')
    .update({ last_notification_at: new Date().toISOString() })
    .eq('id', contactId)
    .then(null, (e: Error) =>
      console.error('[notificationRateLimit] UPDATE last_notification_at falhou:', e.message)
    )

  return 'sent'
}
