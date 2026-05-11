/**
 * /app/api/webhooks/whatsapp/route.ts
 *
 * GET  — Verificação de webhook (handshake com Meta)
 * POST — Recebe mensagens, status e eventos do WhatsApp Cloud API
 *
 * FLUXO POST:
 *  1. Valida HMAC-SHA256 (x-hub-signature-256)           → 401 se inválido
 *  2. Verifica idempotência por meta_message_id            → 200 sem efeito se duplicado
 *  3. Retorna 200 IMEDIATAMENTE via waitUntil             → Meta não retentar
 *  4. Encaminha payload extraído para n8n em background (timeout 5s)
 *  5. Em falha do n8n → INSERT em webhook_dlq
 *
 * EXTRAÇÃO DE MÍDIA (Prompt C2):
 *  O webhook extrai campos de mídia do payload Meta e os inclui no
 *  InboundPayload enviado ao n8n, que os repassa ao /api/n8n/flow-inbound.
 *  Campos: media_id, media_type, media_mime_type, media_caption.
 *
 * SEGURANÇA:
 *  - timingSafeEqual evita timing attacks na comparação HMAC
 *  - rawBody lido uma única vez antes de qualquer parsing
 *  - Erros internos nunca vazam detalhes para o caller
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  handleTemplateStatusUpdate,
  type TemplateStatusUpdateValue,
} from '@/lib/templates'
import type { InboundPayload } from '@/lib/ai/flowInbound'
import type { MediaType } from '@/lib/media/processMedia'

// ── Tipos do payload Meta ─────────────────────────────────────────────────────

interface MetaMediaObject {
  id:        string
  mime_type: string
  sha256?:   string
  caption?:  string
  filename?: string
  voice?:    boolean
}

interface MetaMessage {
  id:        string
  from:      string
  timestamp: string
  type:      string
  text?:     { body: string }
  image?:    MetaMediaObject
  audio?:    MetaMediaObject
  video?:    MetaMediaObject
  document?: MetaMediaObject
  sticker?:  MetaMediaObject
}

interface MetaWebhookPayload {
  object: string
  entry:  Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata?: { phone_number_id: string; display_phone_number: string }
        messages?: MetaMessage[]
        statuses?: Array<{ id: string; status: string; timestamp: string }>
      }
      field: string
    }>
  }>
}

// ── Extração de campos de mídia ───────────────────────────────────────────────

const MEDIA_TYPES = new Set<MediaType>(['image', 'audio', 'video', 'document', 'sticker'])

function extractMediaFields(message: MetaMessage): {
  media_id?:        string
  media_type?:      MediaType
  media_mime_type?: string
  media_caption?:   string
} {
  const type = message.type as MediaType
  if (!MEDIA_TYPES.has(type)) return {}

  const mediaObj = message[type as keyof MetaMessage] as MetaMediaObject | undefined
  if (!mediaObj?.id) return {}

  return {
    media_id:        mediaObj.id,
    media_type:      type,
    media_mime_type: mediaObj.mime_type,
    media_caption:   mediaObj.caption,
  }
}

// ── GET — Verificação do webhook ──────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const expectedToken = process.env.META_VERIFY_TOKEN
  if (!expectedToken || token !== expectedToken) {
    console.warn('[webhook/whatsapp] Verify token inválido')
    return new NextResponse('Forbidden', { status: 403 })
  }

  return new NextResponse(challenge, {
    status:  200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ── POST — Receber mensagens ──────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Ler raw body UMA VEZ ───────────────────────────────────────────────
  const rawBody = await req.text()

  // ── 2. Validar HMAC-SHA256 ────────────────────────────────────────────────
  const sigHeader = req.headers.get('x-hub-signature-256')
  if (!sigHeader) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error('[webhook/whatsapp] META_APP_SECRET não configurado')
    return new NextResponse('Internal Server Error', { status: 500 })
  }

  const expectedSig = 'sha256=' + createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')

  let sigValid = false
  try {
    sigValid = timingSafeEqual(
      Buffer.from(sigHeader, 'utf8'),
      Buffer.from(expectedSig, 'utf8'),
    )
  } catch {
    sigValid = false
  }

  if (!sigValid) {
    console.warn('[webhook/whatsapp] HMAC inválido — possível requisição não autorizada')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // ── 3. Parse do payload ───────────────────────────────────────────────────
  let webhookPayload: MetaWebhookPayload
  try {
    webhookPayload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Bad Request: JSON inválido', { status: 400 })
  }

  if (webhookPayload.object !== 'whatsapp_business_account') {
    return new NextResponse('OK', { status: 200 })
  }

  // ── 4. Tratar atualizações de status de template (SÍNCRONO) ──────────────
  const allChanges = webhookPayload.entry?.[0]?.changes ?? []
  const templateStatusChange = allChanges.find(
    c => c.field === 'message_template_status_update'
  )

  if (templateStatusChange) {
    const wabaId = webhookPayload.entry?.[0]?.id ?? ''
    try {
      await handleTemplateStatusUpdate(
        templateStatusChange.value as unknown as TemplateStatusUpdateValue,
        wabaId,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      console.error('[webhook/whatsapp] handleTemplateStatusUpdate falhou:', msg)
    }
    return new NextResponse('OK', { status: 200 })
  }

  // ── 5. Verificar idempotência por meta_message_id ─────────────────────────
  const message = webhookPayload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  const messageId = message?.id

  if (messageId) {
    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('meta_message_id', messageId)
      .maybeSingle()

    if (existing) {
      return new NextResponse('OK', { status: 200 })
    }
  }

  // ── 6. Extrair payload enriquecido e retornar 200 IMEDIATAMENTE ───────────
  let inboundPayload: InboundPayload | null = null

  if (message && messageId) {
    const wabaId       = webhookPayload.entry?.[0]?.id ?? ''
    const mediaFields  = extractMediaFields(message)
    const messageText  = message.text?.body
      ?? (message[message.type as keyof MetaMessage] as MetaMediaObject | undefined)?.caption
      ?? ''

    inboundPayload = {
      phone_number:  message.from,
      message_text:  messageText,
      message_id:    messageId,
      waba_id:       wabaId,
      timestamp:     parseInt(message.timestamp, 10),
      ...mediaFields,
    }
  }

  // Retorna 200 antes de processar para Meta não retentar (timeout < 20s)
  waitUntil(forwardToN8n(webhookPayload, inboundPayload, messageId))

  return new NextResponse('OK', { status: 200 })
}

// ── Background: encaminhar para n8n ──────────────────────────────────────────

async function forwardToN8n(
  rawPayload:     MetaWebhookPayload,
  inboundPayload: InboundPayload | null,
  messageId?:     string,
): Promise<void> {
  const n8nUrl = process.env.N8N_BASE_URL
  const n8nKey = process.env.N8N_API_KEY

  if (!n8nUrl || !n8nKey) {
    console.error('[webhook/whatsapp] N8N_BASE_URL ou N8N_API_KEY não configurados')
    await insertDlq(rawPayload, 'N8N_BASE_URL ou N8N_API_KEY ausentes')
    return
  }

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 5_000)

  // Envia o inboundPayload enriquecido (inclui campos de mídia) ao n8n.
  // O n8n repassa-o diretamente a /api/n8n/flow-inbound.
  // Se não há payload extraído (ex: apenas status update), envia raw.
  const bodyToSend = inboundPayload ?? rawPayload

  try {
    const res = await fetch(`${n8nUrl}/webhook/whatsapp`, {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': n8nKey,
      },
      body: JSON.stringify(bodyToSend),
    })

    if (!res.ok) {
      throw new Error(`n8n respondeu ${res.status}`)
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[webhook/whatsapp] Falha ao encaminhar para n8n:', errMsg, 'messageId:', messageId)
    await insertDlq(rawPayload, errMsg)
  } finally {
    clearTimeout(timer)
  }
}

// ── DLQ: inserir payload com falha ───────────────────────────────────────────

async function insertDlq(
  payload: MetaWebhookPayload,
  error:   string,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('webhook_dlq').insert({
      source:       'whatsapp',
      payload:      payload as unknown as import('@/lib/supabase/types').Json,
      error,
      attempts:     1,
      last_attempt: new Date().toISOString(),
    })
  } catch (dlqErr) {
    const msg = dlqErr instanceof Error ? dlqErr.message : 'erro desconhecido'
    console.error('[webhook/whatsapp] DLQ INSERT falhou:', msg)
  }
}
