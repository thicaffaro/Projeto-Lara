/**
 * /lib/ai/flowInbound.ts
 * Motor principal de processamento de mensagens recebidas.
 *
 * NODES:
 *  1.   Identifica profissional pela waba_id
 *  2.   Salva mensagem (idempotência via meta_message_id UNIQUE)
 *  2.5  Processa mídia (download → upload → transcrição se áudio)
 *  3.   Busca ou cria contato + atualiza last_inbound_message_at
 *  4.   Verifica bloqueios da profissional (pausa, silent_hours, handover ativo)
 *  5.   Verifica se contato está bloqueado
 *  6.   Verifica lara_mode='silent'
 *  6.5  Detector de urgência (bypass rate-limit de notificação)
 *  7.   Classifica intent (adapta texto para mídia)
 *  8.   Verifica should_lara_respond (inclui lock de typing)
 *  9.   Roteador por intent
 * 10.   Envia resposta
 * 11.   Atualiza latency_ms e lara_mode_decision
 * 12.   Escreve audit_log
 */

import { createAdminClient }          from '@/lib/supabase/admin'
import { callLLM }                    from './llm'
import {
  buildSystemPromptExternal,
  formatWorkingHoursForPrompt,
  formatProtocolsForPrompt,
  formatServiceAreasForPrompt,
  formatSpecialtyLabel,
  formatServiceModeLabel,
  type ProfessionalContext,
  type ContactContext,
}                                     from './prompts'
import { classifyIntent }             from './intentClassifier'
import { notifyProfessionalIfAllowed } from './notificationRateLimit'
import { handleBookingFlow }          from './bookingFlow'
import { handleCancellationFlow }     from './cancellationFlow'
import { sendTextMessage, sendFromOfficialNumber, getProfessionalToken } from '@/lib/whatsapp'
import { decryptToken }               from '@/lib/crypto'
import { processMedia, type MediaType, type ProcessedMedia } from '@/lib/media/processMedia'
import { randomUUID }                 from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface InboundPayload {
  phone_number:     string
  message_text:     string          // texto livre ou caption; pode ser vazio para mídia sem legenda
  message_id:       string
  waba_id:          string
  timestamp:        number
  // Campos de mídia (adicionados no Prompt C2)
  media_id?:        string          // ID da mídia no CDN Meta
  media_type?:      MediaType       // image | audio | video | document | sticker
  media_mime_type?: string          // ex: 'audio/ogg; codecs=opus'
  media_caption?:   string          // legenda em imagens/vídeos
}

export interface FlowInboundResult {
  status:             'responded' | 'silent' | 'error'
  lara_mode_decision: string
  intent?:            string
  latency_ms:         number
}

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ProfRow {
  id:                   string
  name:                 string
  phone_number:         string
  meta_phone_number_id: string | null
  timezone:             string
  is_paused:            boolean
  silent_hours:         { start: string; end: string } | null
  default_lara_mode:    string
  whatsapp_status:      string
  service_mode:         string
  specialty:            string
  working_hours:        Record<string, unknown> | null
  protocols:            Array<{ name: string; duration_min: number; price_brl: number }> | null
  studio_address:       Record<string, unknown> | null
  service_areas:        Record<string, string[]> | null
  access_token_encrypted: string | null
}

interface ContactRow {
  id:                   string
  name:                 string | null
  contact_type:         string
  lara_mode:            'full' | 'booking_only' | 'silent'
  is_blocked:           boolean
  last_notification_at: string | null
}

interface SavedMessage {
  id: string
}

// ── Funções auxiliares ────────────────────────────────────────────────────────

function checkSilentHours(
  silentHours: { start: string; end: string } | null,
  timezone:    string,
): boolean {
  if (!silentHours) return false

  const toMinutes = (t: string): number => {
    const [h, m] = t.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }

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
  if (start > end) return current >= start || current < end
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
  professionalId:  string
  phone_number:    string
  message_text:    string
  meta_message_id: string
  direction:       'inbound' | 'outbound'
  timestamp:       number
  media_type?:     MediaType
}): Promise<SavedMessage | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('messages')
    .insert({
      professional_id: params.professionalId,
      meta_message_id: params.meta_message_id,
      direction:       params.direction,
      message_type:    params.media_type ?? 'text',
      content:         params.message_text || null,
      channel:         'whatsapp',
      created_at:      new Date(params.timestamp * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return null // duplicada
    console.error('[flowInbound] saveMessage error:', error.message)
    return null
  }

  return data as unknown as SavedMessage
}

async function updateMessageDecision(
  messageId: string,
  decision:  string,
  extra?:    { latency_ms?: number; sent_by?: string },
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

  const workingHoursFormatted = formatWorkingHoursForPrompt(p?.working_hours as Parameters<typeof formatWorkingHoursForPrompt>[0] ?? null)
  const protocolsFormatted    = formatProtocolsForPrompt(p?.protocols ?? null)
  const serviceAreasFormatted = p?.service_areas ? formatServiceAreasForPrompt(p.service_areas) : undefined
  const studioAddress         = p?.studio_address
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
  professionalId:  string
  contactId:       string
  decision:        string
  intent:          string | null
  latency_ms?:     number
  llmProvider?:    string
  intentProvider?: string
}): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('audit_log').insert({
    professional_id:    params.professionalId,
    actor:              'lara',
    action:             'message_processed',
    lara_mode_decision: params.decision,
    new_data: {
      intent:          params.intent,
      latency_ms:      params.latency_ms,
      llm_provider:    params.llmProvider,
      intent_provider: params.intentProvider,
    },
  }).then(null, (e: Error) =>
    console.error('[flowInbound] audit_log falhou:', e.message)
  )
}

async function triggerHumanHandover(
  contactId:      string,
  professionalId: string,
  lastMessage:    string,
): Promise<void> {
  const supabase = createAdminClient()

  await supabase.from('human_handovers').insert({
    professional_id: professionalId,
    contact_id:      contactId,
    status:          'active',
    context:         { last_message: lastMessage.slice(0, 500) },
  })

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

async function sendLaraTextResponse(
  professionalId: string,
  phoneNumberId:  string,
  toPhoneNumber:  string,
  text:           string,
): Promise<void> {
  const token = await getProfessionalToken(professionalId)
  await sendTextMessage(phoneNumberId, token, toPhoneNumber, text, professionalId)
  ;(token as unknown as undefined)
}

// ── flowInbound — nodes ───────────────────────────────────────────────────────

export async function flowInbound(payload: InboundPayload): Promise<FlowInboundResult> {
  const startTime = Date.now()
  const supabase  = createAdminClient()

  // ── NODE 1: Identificar profissional ──────────────────────────────────────
  const { data: rawProf } = await supabase
    .from('professionals')
    .select([
      'id', 'name', 'phone_number', 'meta_phone_number_id', 'timezone',
      'is_paused', 'silent_hours', 'default_lara_mode', 'whatsapp_status',
      'service_mode', 'specialty', 'working_hours', 'protocols',
      'studio_address', 'service_areas', 'access_token_encrypted',
    ].join(', '))
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
    professionalId:  prof.id,
    phone_number:    payload.phone_number,
    message_text:    payload.message_text,
    meta_message_id: payload.message_id,
    direction:       'inbound',
    timestamp:       payload.timestamp,
    media_type:      payload.media_type,
  })

  if (!savedMessage) {
    return { status: 'silent', lara_mode_decision: 'duplicate', latency_ms: Date.now() - startTime }
  }

  // ── NODE 2.5: Processar mídia (download → upload → transcrição) ───────────
  // Executado ANTES da criação do contato para garantir que a URL do CDN
  // não expire (~5min). O contact_id é atualizado logo abaixo em NODE 3.
  let processedMedia: ProcessedMedia | null = null

  if (payload.media_id && payload.media_type && payload.media_type !== 'sticker') {
    let accessToken: string | null = null

    try {
      if (prof.access_token_encrypted) {
        accessToken = await decryptToken(prof.access_token_encrypted)
      }
    } catch (err) {
      console.error('[flowInbound] Falha ao decriptografar token para mídia:', err instanceof Error ? err.message : err)
    }

    if (accessToken) {
      // Usa um UUID temporário para o contact_id no path do storage.
      // Será organizado corretamente no próximo upload se o contactId mudar.
      // Na prática, o contato já existe para a maioria das mensagens.
      const tempContactId = 'pending'

      processedMedia = await processMedia({
        mediaId:        payload.media_id,
        mediaType:      payload.media_type,
        mimeType:       payload.media_mime_type ?? 'application/octet-stream',
        caption:        payload.media_caption,
        accessToken,
        professionalId: prof.id,
        contactId:      tempContactId,
      })
      ;(accessToken as unknown as undefined) // zera referência do token

      if (processedMedia) {
        await supabase.from('messages').update({
          media_url:        processedMedia.storageUrl,
          media_type:       processedMedia.mediaType,
          media_size_bytes: processedMedia.sizeBytes,
          media_caption:    processedMedia.caption ?? payload.media_caption ?? null,
          message_type:     processedMedia.mediaType,
        }).eq('id', savedMessage.id)
      }
    }
  }

  // ── NODE 3: Buscar ou criar contato + atualizar last_inbound_message_at ────
  const { data: rawContact } = await supabase
    .from('contacts')
    .select('id, name, contact_type, lara_mode, is_blocked, last_notification_at')
    .eq('professional_id', prof.id)
    .eq('phone_number', payload.phone_number)
    .maybeSingle()

  let contactData = rawContact as unknown as ContactRow | null
  let contactId:   string

  if (!contactData) {
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

  // Atualizar contact_id na mensagem e timestamps da janela 24h
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('messages')
      .update({ contact_id: contactId })
      .eq('id', savedMessage.id),
    supabase.from('contacts')
      .update({ last_inbound_message_at: now, last_message_at: now })
      .eq('id', contactId),
  ])

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
      const preview = payload.message_text || payload.media_caption
        || (payload.media_type ? `[${payload.media_type}]` : '')
      await notifyProfessionalIfAllowed({
        contactId,
        professionalId: prof.id,
        contactName:    contactData?.name ?? null,
        contactPhone:   payload.phone_number,
        messagePreview: preview.slice(0, 80),
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
    const token   = await getMagicLinkToken(prof.id)
    const preview = payload.message_text || payload.media_caption
      || (payload.media_type ? `[${payload.media_type}]` : '')
    await notifyProfessionalIfAllowed({
      contactId,
      professionalId: prof.id,
      contactName:    contactData.name ?? null,
      contactPhone:   payload.phone_number,
      messagePreview: preview.slice(0, 80),
      magicLinkToken: token,
    })
    await writeAuditLog({ professionalId: prof.id, contactId, decision: 'silent_personal', intent: null })
    return { status: 'silent', lara_mode_decision: 'silent_personal', latency_ms: Date.now() - startTime }
  }

  // ── NODE 6.5: Detector de urgência ────────────────────────────────────────
  // Se conteúdo classificado como urgente → notifica profissional IMEDIATAMENTE,
  // ignorando o rate-limit. O flow CONTINUA normalmente (urgência é notificação extra).
  const contentToCheck = payload.message_text
    || payload.media_caption
    || processedMedia?.transcription
    || ''

  if (contentToCheck) {
    try {
      const { data: isUrgent } = await supabase
        .rpc('detect_message_urgency', { p_content: contentToCheck })

      if (isUrgent) {
        const token = await getMagicLinkToken(prof.id)
        sendFromOfficialNumber(
          prof.phone_number,
          `🚨 URGENTE: ${contactData?.name ?? payload.phone_number} precisa de atenção!\n` +
          `"${contentToCheck.slice(0, 100)}"\nVeja agora: ${APP_URL}/d/${token}`,
        ).catch((e: Error) =>
          console.error('[flowInbound] notify urgente falhou:', e.message)
        )

        // Marca a mensagem com 'urgent_bypass' — o flow continua normalmente
        await updateMessageDecision(savedMessage.id, 'urgent_bypass')

        await writeAuditLog({
          professionalId: prof.id,
          contactId,
          decision: 'urgent_bypass',
          intent:   null,
        })
      }
    } catch (err) {
      // Falha no detector não bloqueia o flow
      console.warn('[flowInbound] detect_message_urgency falhou:', err instanceof Error ? err.message : err)
    }
  }

  // ── NODE 7: Classificar intent (adapta para mídia) ────────────────────────
  // Determina o texto para classificação com base no tipo de mensagem
  const textForClassification: string =
    payload.message_text                    ? payload.message_text          // texto normal
    : payload.media_caption                 ? payload.media_caption         // imagem/vídeo com legenda
    : (processedMedia?.transcription ?? '') !== '' ? (processedMedia!.transcription ?? '') // áudio transcrito
    : ''  // sem texto: vídeo/documento sem legenda, imagem sem legenda, áudio sem transcrição

  // Mídia sem texto classificável → silent_media_only
  if (!textForClassification) {
    await updateMessageDecision(savedMessage.id, 'silent_media_only')

    const token = await getMagicLinkToken(prof.id)
    const typeLabel = payload.media_type ?? 'mensagem'
    await notifyProfessionalIfAllowed({
      contactId,
      professionalId: prof.id,
      contactName:    contactData?.name ?? null,
      contactPhone:   payload.phone_number,
      messagePreview: `[${typeLabel}]`,
      magicLinkToken: token,
    })

    await writeAuditLog({ professionalId: prof.id, contactId, decision: 'silent_media_only', intent: null })
    return { status: 'silent', lara_mode_decision: 'silent_media_only', latency_ms: Date.now() - startTime }
  }

  const { intent, provider: intentProvider } = await classifyIntent(textForClassification)

  // ── NODE 8: should_lara_respond ───────────────────────────────────────────
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
      messagePreview: textForClassification.slice(0, 80),
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

  // Texto usado para o LLM/flows: usa a transcrição se for áudio, senão o texto original
  const textForFlow = processedMedia?.transcription ?? textForClassification

  let responseText = ''
  let llmProvider  = 'unknown'

  switch (intent) {
    case 'AGENDAR': {
      const res = await handleBookingFlow(contactId, textForFlow, profContext, contactCtx, prof)
      responseText = res.responseText
      llmProvider  = res.llmProvider

      if (responseText.startsWith('__handover__')) {
        await triggerHumanHandover(contactId, prof.id, textForFlow)
        responseText = `Vou chamar a ${profContext.professional_name} para te ajudar diretamente! Um momento. 🙏`
      }
      break
    }

    case 'CANCELAR': {
      const res = await handleCancellationFlow(contactId, textForFlow, profContext, prof)
      responseText = res.responseText
      llmProvider  = res.llmProvider

      if (responseText === '__reschedule__') {
        const bookingRes = await handleBookingFlow(contactId, 'quero remarcar', profContext, contactCtx, prof)
        responseText = bookingRes.responseText
        llmProvider  = bookingRes.llmProvider
      }
      break
    }

    case 'REMARCAR': {
      const res = await handleBookingFlow(contactId, textForFlow, profContext, contactCtx, prof)
      responseText = res.responseText
      llmProvider  = res.llmProvider
      break
    }

    case 'SUPORTE': {
      await triggerHumanHandover(contactId, prof.id, textForFlow)
      responseText = `Entendido! Vou avisar a ${profContext.professional_name} agora mesmo. Ela responde assim que puder! 💛`
      llmProvider  = 'rule_based'
      break
    }

    default: {
      const systemPrompt = buildSystemPromptExternal(profContext, contactCtx)
      const llmResult    = await callLLM(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: textForFlow },
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
