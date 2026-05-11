/**
 * /lib/ai/flowInbound.ts
 * Motor principal de processamento de mensagens recebidas.
 *
 * 12 nodes em sequência:
 *  1. Identifica profissional pela waba_id
 *  2. Salva mensagem (idempotência via meta_message_id UNIQUE)
 *  3. Busca ou cria contato
 *  4. Verifica bloqueios da profissional (pausa, silent_hours, handover ativo)
 *  5. Verifica se contato está bloqueado
 *  6. Verifica lara_mode='silent'
 *  7. Classifica intent
 *  8. Verifica should_lara_respond (inclui lock de typing)
 *  9. Roteador por intent
 * 10. Envia resposta
 * 11. Atualiza latency_ms e lara_mode_decision
 * 12. Escreve audit_log
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { callLLM } from './llm'
import {
  buildSystemPromptExternal,
  formatWorkingHoursForPrompt,
  formatProtocolsForPrompt,
  formatServiceAreasForPrompt,
  formatSpecialtyLabel,
  formatServiceModeLabel,
  type ProfessionalContext,
  type ContactContext,
} from './prompts'
import { classifyIntent } from './intentClassifier'
import { notifyProfessionalIfAllowed } from './notificationRateLimit'
import { handleBookingFlow } from './bookingFlow'
import { handleCancellationFlow } from './cancellationFlow'
import { sendTextMessage, sendFromOfficialNumber, getProfessionalToken } from '@/lib/whatsapp'
import { randomUUID } from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface InboundPayload {
  phone_number: string
  message_text: string
  message_id: string
  waba_id: string
  timestamp: number
}

export interface FlowInboundResult {
  status: 'responded' | 'silent' | 'error'
  lara_mode_decision: string
  intent?: string
  latency_ms: number
}

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ProfRow {
  id: string
  name: string
  phone_number: string
  meta_phone_number_id: string | null
  timezone: string
  is_paused: boolean
  silent_hours: { start: string; end: string } | null
  default_lara_mode: string
  whatsapp_status: string
  service_mode: string
  specialty: string
  working_hours: Record<string, unknown> | null
  protocols: Array<{ name: string; duration_min: number; price_brl: number }> | null
  studio_address: Record<string, unknown> | null
  service_areas: Record<string, string[]> | null
}

interface ContactRow {
  id: string
  name: string | null
  contact_type: string
  lara_mode: 'full' | 'booking_only' | 'silent'
  is_blocked: boolean
  last_notification_at: string | null
}

interface SavedMessage {
  id: string
}

// ── Funções auxiliares ────────────────────────────────────────────────────────

function checkSilentHours(
  silentHours: { start: string; end: string } | null,
  timezone: string,
): boolean {
  if (!silentHours) return false

  const toMinutes = (t: string): number => {
    const [h, m] = t.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }

  // Hora atual no fuso da profissional (formato HH:MM)
  const nowLocal = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).format(new Date())

  const current = toMinutes(nowLocal)
  const start   = toMinutes(silentHours.start)
  const end     = toMinutes(silentHours.end)

  // Trata range que passa da meia-noite (ex: 22:00–08:00)
  if (start > end) {
    return current >= start || current < end
  }
  return current >= start && current < end
}

async function checkActiveHandover(contactId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('human_handovers')
    .select('id')
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}

async function saveMessage(params: {
  professionalId: string
  phone_number: string
  message_text: string
  meta_message_id: string
  direction: 'inbound' | 'outbound'
  timestamp: number
}): Promise<SavedMessage | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('messages')
    .insert({
      professional_id:  params.professionalId,
      meta_message_id:  params.meta_message_id,
      direction:        params.direction,
      message_type:     'text',
      content:          params.message_text,
      channel:          'whatsapp',
      created_at:       new Date(params.timestamp * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    // Código 23505 = violação de unicidade → mensagem duplicada
    if (error.code === '23505') return null
    console.error('[flowInbound] saveMessage error:', error.message)
    return null
  }

  return data as unknown as SavedMessage
}

async function updateMessageDecision(
  messageId: string,
  decision: string,
  extra?: { latency_ms?: number; sent_by?: string },
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('messages')
    .update({
      lara_mode_decision: decision,
      ...(extra?.latency_ms ? { latency_ms: extra.latency_ms } : {}),
      ...(extra?.sent_by    ? { sent_by: extra.sent_by }        : {}),
    })
    .eq('id', messageId)
}

async function getMagicLinkToken(professionalId: string): Promise<string> {
  const supabase = createAdminClient()

  // Busca token válido existente
  const { data: existing } = await supabase
    .from('magic_links')
    .select('token')
    .eq('professional_id', professionalId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return (existing as unknown as { token: string }).token

  // Gera novo token (30 min)
  const token     = randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()

  await supabase.from('magic_links').insert({
    professional_id: professionalId,
    token,
    purpose:    'login',
    expires_at: expiresAt,
  })

  return token
}

async function buildProfessionalContext(professionalId: string): Promise<ProfessionalContext & { service_mode: string }> {
  const supabase = createAdminClient()

  const { data: raw } = await supabase
    .from('professionals')
    .select('name, specialty, service_mode, working_hours, protocols, studio_address, service_areas, timezone')
    .eq('id', professionalId)
    .single()

  const p = raw as unknown as ProfRow

  const workingHoursFormatted   = formatWorkingHoursForPrompt(p?.working_hours as Parameters<typeof formatWorkingHoursForPrompt>[0] ?? null)
  const protocolsFormatted      = formatProtocolsForPrompt(p?.protocols ?? null)
  const serviceAreasFormatted   = p?.service_areas ? formatServiceAreasForPrompt(p.service_areas) : undefined

  const studioAddress = p?.studio_address
    ? Object.values(p.studio_address as Record<string, string>).filter(Boolean).join(', ')
    : undefined

  return {
    professional_name:  p?.name ?? 'a profissional',
    specialty_label:    formatSpecialtyLabel(p?.specialty ?? 'facial'),
    service_mode:       (p?.service_mode ?? 'studio') as 'studio' | 'home' | 'both',
    service_mode_label: formatServiceModeLabel(p?.service_mode ?? 'studio'),
    working_hours:      workingHoursFormatted,
    protocols_list:     protocolsFormatted,
    studio_address:     studioAddress,
    service_areas:      serviceAreasFormatted,
    timezone:           p?.timezone ?? 'America/Sao_Paulo',
  }
}

async function writeAuditLog(params: {
  professionalId: string
  contactId: string
  decision: string
  intent: string | null
  latency_ms?: number
  llmProvider?: string
  intentProvider?: string
}): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('audit_log').insert({
    professional_id: params.professionalId,
    actor: 'lara',
    action: 'message_processed',
    new_data: {
      lara_mode_decision: params.decision,
      intent:             params.intent,
      latency_ms:         params.latency_ms,
      llm_provider:       params.llmProvider,
      intent_provider:    params.intentProvider,
    },
  }).then(null, (e: Error) =>
    console.error('[flowInbound] audit_log falhou:', e.message)
  )
}

async function triggerHumanHandover(
  contactId: string,
  professionalId: string,
  lastMessage: string,
): Promise<void> {
  const supabase = createAdminClient()

  // INSERT em human_handovers
  await supabase.from('human_handovers').insert({
    professional_id: professionalId,
    contact_id:      contactId,
    status:          'active',
    context:         { last_message: lastMessage.slice(0, 500) },
  })

  // Notifica profissional
  const { data: rawProf } = await supabase
    .from('professionals')
    .select('phone_number, name')
    .eq('id', professionalId)
    .single()

  const p = rawProf as unknown as { phone_number: string; name: string } | null

  if (p) {
    const token = await getMagicLinkToken(professionalId)
    sendFromOfficialNumber(
      p.phone_number,
      `🔔 Uma cliente precisa de atendimento direto. Acesse o painel: ${APP_URL}/d/${token}`,
    ).catch((e: Error) =>
      console.error('[flowInbound] triggerHumanHandover notificação falhou:', e.message)
    )
  }
}

/** Envia texto simples via número da profissional → cliente */
async function sendLaraTextResponse(
  professionalId: string,
  phoneNumberId: string,
  toPhoneNumber: string,
  text: string,
): Promise<void> {
  const token = await getProfessionalToken(professionalId)
  await sendTextMessage(phoneNumberId, token, toPhoneNumber, text, professionalId)
  ;(token as any) = null
}

// ── flowInbound — 12 nodes ────────────────────────────────────────────────────

export async function flowInbound(payload: InboundPayload): Promise<FlowInboundResult> {
  const startTime = Date.now()
  const supabase  = createAdminClient()

  // ── NODE 1: Identificar profissional ──────────────────────────────────────
  const { data: rawProf } = await supabase
    .from('professionals')
    .select('id, name, phone_number, meta_phone_number_id, timezone, is_paused, silent_hours, default_lara_mode, whatsapp_status, service_mode, specialty, working_hours, protocols, studio_address, service_areas')
    .eq('meta_waba_id', payload.waba_id)
    .single()

  const prof = rawProf as unknown as ProfRow | null

  if (!prof) {
    console.error('[flowInbound] professional not found for waba_id:', payload.waba_id)
    return { status: 'error', lara_mode_decision: 'professional_not_found', latency_ms: Date.now() - startTime }
  }

  if (prof.whatsapp_status === 'token_invalid') {
    await saveMessage({ professionalId: prof.id, phone_number: payload.phone_number, message_text: payload.message_text, meta_message_id: payload.message_id, direction: 'inbound', timestamp: payload.timestamp })
    return { status: 'silent', lara_mode_decision: 'token_invalid', latency_ms: Date.now() - startTime }
  }

  // ── NODE 2: Salvar mensagem (idempotência) ────────────────────────────────
  const savedMessage = await saveMessage({
    professionalId: prof.id,
    phone_number:   payload.phone_number,
    message_text:   payload.message_text,
    meta_message_id: payload.message_id,
    direction:      'inbound',
    timestamp:      payload.timestamp,
  })

  if (!savedMessage) {
    return { status: 'silent', lara_mode_decision: 'duplicate', latency_ms: Date.now() - startTime }
  }

  // ── NODE 3: Buscar ou criar contato ───────────────────────────────────────
  const { data: rawContact } = await supabase
    .from('contacts')
    .select('id, name, contact_type, lara_mode, is_blocked, last_notification_at')
    .eq('professional_id', prof.id)
    .eq('phone_number', payload.phone_number)
    .maybeSingle()

  let contactData = rawContact as unknown as ContactRow | null
  let contactId: string

  if (!contactData) {
    // Cria contato via promote_to_contact (equivalente ao handle_new_contact do spec)
    const { data: newId } = await supabase.rpc('promote_to_contact', {
      p_professional_id: prof.id,
      p_phone_number:    payload.phone_number,
    })
    contactId = newId as string

    const { data: fresh } = await supabase
      .from('contacts')
      .select('id, name, contact_type, lara_mode, is_blocked, last_notification_at')
      .eq('id', contactId)
      .single()
    contactData = fresh as unknown as ContactRow
  } else {
    contactId = contactData.id
  }

  // Atualiza contact_id na mensagem salva
  await supabase
    .from('messages')
    .update({ contact_id: contactId })
    .eq('id', savedMessage.id)

  // ── NODE 4: Bloqueios da profissional ─────────────────────────────────────
  const isPaused          = prof.is_paused
  const isInSilentHours   = checkSilentHours(prof.silent_hours, prof.timezone)
  const hasActiveHandover = await checkActiveHandover(contactId)

  if (isPaused || isInSilentHours || hasActiveHandover) {
    const decision = isPaused ? 'silent_paused'
                   : isInSilentHours ? 'silent_hours'
                   : 'silent_handover'

    await updateMessageDecision(savedMessage.id, decision)

    if (!hasActiveHandover) {
      const token = await getMagicLinkToken(prof.id)
      await notifyProfessionalIfAllowed({
        contactId,
        professionalId: prof.id,
        contactName:    contactData?.name ?? null,
        contactPhone:   payload.phone_number,
        messagePreview: payload.message_text.slice(0, 80),
        magicLinkToken: token,
      })
    }

    await writeAuditLog({ professionalId: prof.id, contactId, decision, intent: null })
    return { status: 'silent', lara_mode_decision: decision, latency_ms: Date.now() - startTime }
  }

  // ── NODE 5: Contato bloqueado ─────────────────────────────────────────────
  if (contactData?.is_blocked) {
    await updateMessageDecision(savedMessage.id, 'silent_blocked')
    await writeAuditLog({ professionalId: prof.id, contactId, decision: 'silent_blocked', intent: null })
    return { status: 'silent', lara_mode_decision: 'silent_blocked', latency_ms: Date.now() - startTime }
  }

  // ── NODE 6: lara_mode='silent' ────────────────────────────────────────────
  if (contactData?.lara_mode === 'silent') {
    await updateMessageDecision(savedMessage.id, 'silent_personal')
    const token = await getMagicLinkToken(prof.id)
    await notifyProfessionalIfAllowed({
      contactId,
      professionalId: prof.id,
      contactName:    contactData.name ?? null,
      contactPhone:   payload.phone_number,
      messagePreview: payload.message_text.slice(0, 80),
      magicLinkToken: token,
    })
    await writeAuditLog({ professionalId: prof.id, contactId, decision: 'silent_personal', intent: null })
    return { status: 'silent', lara_mode_decision: 'silent_personal', latency_ms: Date.now() - startTime }
  }

  // ── NODE 7: Classificar intent ────────────────────────────────────────────
  const { intent, provider: intentProvider } = await classifyIntent(payload.message_text)

  // ── NODE 8: should_lara_respond ───────────────────────────────────────────
  // Inclui verificação de professional_typing_until (anti-race)
  const { data: shouldRespond } = await supabase.rpc('should_lara_respond', {
    p_contact_id: contactId,
    p_intent:     intent,
  })

  if (!shouldRespond) {
    await updateMessageDecision(savedMessage.id, 'silent_out_of_scope')
    const token = await getMagicLinkToken(prof.id)
    await notifyProfessionalIfAllowed({
      contactId,
      professionalId: prof.id,
      contactName:    contactData?.name ?? null,
      contactPhone:   payload.phone_number,
      messagePreview: payload.message_text.slice(0, 80),
      magicLinkToken: token,
    })
    await writeAuditLog({ professionalId: prof.id, contactId, decision: 'silent_out_of_scope', intent, intentProvider })
    return { status: 'silent', lara_mode_decision: 'silent_out_of_scope', intent, latency_ms: Date.now() - startTime }
  }

  // ── NODE 9: Roteador por intent ───────────────────────────────────────────
  const profContext = await buildProfessionalContext(prof.id)
  const contactCtx: ContactContext = {
    contact_name: contactData?.name ?? null,
    lara_mode:    (contactData?.lara_mode ?? 'booking_only') as 'full' | 'booking_only',
  }

  let responseText = ''
  let llmProvider  = 'unknown'

  switch (intent) {
    case 'AGENDAR': {
      const res = await handleBookingFlow(contactId, payload.message_text, profContext, contactCtx, prof)
      responseText = res.responseText
      llmProvider  = res.llmProvider

      // Handover detectado pelo booking flow
      if (responseText.startsWith('__handover__')) {
        const reason = responseText.split(':')[1] ?? 'dados_insuficientes'
        await triggerHumanHandover(contactId, prof.id, payload.message_text)
        responseText = `Vou chamar a ${profContext.professional_name} para te ajudar diretamente! Um momento. 🙏`
      }
      break
    }

    case 'CANCELAR': {
      const res = await handleCancellationFlow(contactId, payload.message_text, profContext, prof)
      responseText = res.responseText
      llmProvider  = res.llmProvider

      // Quer remarcar → redireciona para booking
      if (responseText === '__reschedule__') {
        const bookingRes = await handleBookingFlow(contactId, 'quero remarcar', profContext, contactCtx, prof)
        responseText = bookingRes.responseText
        llmProvider  = bookingRes.llmProvider
      }
      break
    }

    case 'REMARCAR': {
      // Usa booking flow com contexto de remarcação
      const res = await handleBookingFlow(contactId, payload.message_text, profContext, contactCtx, prof)
      responseText = res.responseText
      llmProvider  = res.llmProvider
      break
    }

    case 'SUPORTE': {
      await triggerHumanHandover(contactId, prof.id, payload.message_text)
      responseText = `Entendido! Vou avisar a ${profContext.professional_name} agora mesmo. Ela responde assim que puder! 💛`
      llmProvider  = 'rule_based'
      break
    }

    default: {
      // INFORMACAO | OUTRO → LLM com prompt externo
      const systemPrompt = buildSystemPromptExternal(profContext, contactCtx)
      const llmResult    = await callLLM(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: payload.message_text },
        ],
        { maxTokens: 300, temperature: 0.7 },
      )
      responseText = llmResult.text || `Deixa eu verificar com a ${profContext.professional_name} e já te respondo!`
      llmProvider  = llmResult.provider
      break
    }
  }

  // ── NODE 10: Envia resposta ───────────────────────────────────────────────
  if (responseText && prof.meta_phone_number_id) {
    try {
      await sendLaraTextResponse(
        prof.id,
        prof.meta_phone_number_id,
        payload.phone_number,
        responseText,
      )
    } catch (err) {
      console.error('[flowInbound] sendLaraTextResponse falhou:', err instanceof Error ? err.message : 'unknown')
    }
  }

  // ── NODE 11: Atualiza latency_ms e decisão ────────────────────────────────
  const latency_ms = Date.now() - startTime
  await updateMessageDecision(savedMessage.id, 'responded', { latency_ms, sent_by: 'lara' })

  // ── NODE 12: Audit log ────────────────────────────────────────────────────
  await writeAuditLog({
    professionalId: prof.id,
    contactId,
    decision:       'responded',
    intent,
    latency_ms,
    llmProvider,
    intentProvider,
  })

  return { status: 'responded', lara_mode_decision: 'responded', intent, latency_ms }
}
