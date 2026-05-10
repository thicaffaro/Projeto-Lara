/**
 * /app/api/webhooks/whatsapp/route.ts
 *
 * GET  — Verificação de webhook (handshake com Meta)
 * POST — Recebe mensagens, status e eventos do WhatsApp Cloud API
 *
 * FLUXO POST:
 *  1. Valida HMAC-SHA256 (x-hub-signature-256)          → 401 se inválido
 *  2. Verifica idempotência por meta_message_id           → 200 sem efeito se duplicado
 *  3. Retorna 200 IMEDIATAMENTE via waitUntil            → Meta não retentar
 *  4. Encaminha payload para n8n em background (timeout 5s)
 *  5. Em falha do n8n → INSERT em webhook_dlq
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

// ── Tipos do payload Meta ─────────────────────────────────────────────────────

interface MetaMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
}

interface MetaWebhookPayload {
  object: string
  entry: Array<{
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

  // Retorna o challenge como texto plano (exigência Meta)
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ── POST — Receber mensagens ──────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Ler raw body UMA VEZ (necessário para HMAC e parsing) ──────────────
  const rawBody = await req.text()

  // ── 2. Validar HMAC-SHA256 ─────────────────────────────────────────────────
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
    // timingSafeEqual exige buffers de mesmo tamanho
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

  // ── 3. Parse do payload ────────────────────────────────────────────────────
  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Bad Request: JSON inválido', { status: 400 })
  }

  // Apenas processar payloads do WhatsApp
  if (payload.object !== 'whatsapp_business_account') {
    return new NextResponse('OK', { status: 200 })
  }

  // ── 4. Verificar idempotência por meta_message_id ──────────────────────────
  const messageId = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id

  if (messageId) {
    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('meta_message_id', messageId)
      .maybeSingle()

    if (existing) {
      // Mensagem já processada — retorna 200 sem efeito colateral
      return new NextResponse('OK', { status: 200 })
    }
  }

  // ── 5. Retornar 200 IMEDIATAMENTE, processar em background ────────────────
  // waitUntil garante que o processamento conclua mesmo após o response ser enviado.
  // Meta considera timeout > 20s como falha — este padrão garante < 200ms de resposta.
  waitUntil(forwardToN8n(payload, messageId))

  return new NextResponse('OK', { status: 200 })
}

// ── Background: encaminhar para n8n ──────────────────────────────────────────

async function forwardToN8n(
  payload: MetaWebhookPayload,
  messageId?: string,
): Promise<void> {
  const n8nUrl = process.env.N8N_BASE_URL
  const n8nKey = process.env.N8N_API_KEY

  if (!n8nUrl || !n8nKey) {
    console.error('[webhook/whatsapp] N8N_BASE_URL ou N8N_API_KEY não configurados')
    await insertDlq(payload, 'N8N_BASE_URL ou N8N_API_KEY ausentes')
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000) // timeout 5s

  try {
    const res = await fetch(`${n8nUrl}/webhook/whatsapp`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': n8nKey,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`n8n respondeu ${res.status}`)
    }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[webhook/whatsapp] Falha ao encaminhar para n8n:', errMsg, 'messageId:', messageId)
    await insertDlq(payload, errMsg)
  } finally {
    clearTimeout(timer)
  }
}

// ── DLQ: inserir payload com falha ───────────────────────────────────────────

async function insertDlq(
  payload: MetaWebhookPayload,
  error: string,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('webhook_dlq').insert({
      source: 'whatsapp',
      payload: payload as unknown as Record<string, unknown>,
      error,
      attempts: 1,
      last_attempt: new Date().toISOString(),
    })
  } catch (dlqErr) {
    // DLQ falhou — logar mas não lançar (evita loop)
    const msg = dlqErr instanceof Error ? dlqErr.message : 'erro desconhecido'
    console.error('[webhook/whatsapp] DLQ INSERT falhou:', msg)
  }
}
