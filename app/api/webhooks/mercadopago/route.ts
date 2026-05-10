/**
 * /app/api/webhooks/mercadopago/route.ts
 *
 * Recebe notificações do Mercado Pago sobre assinaturas.
 * Documentação MP: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/notifications
 *
 * ASSINATURA MP:
 *   Header: x-signature
 *   Formato: ts=<timestamp>,v1=<hmac-sha256>
 *   Mensagem para HMAC: "id:<notification_id>;request-id:<x-request-id>;ts:<ts>"
 *
 * EVENTOS PROCESSADOS:
 *   - subscription_preapproval.created   → status='trial' ou 'active'
 *   - subscription_preapproval.updated   → atualiza status
 *   - subscription_preapproval.cancelled → status='cancelled'
 *
 * SEGURANÇA:
 *   - HMAC validado antes de qualquer processamento
 *   - Idempotente: upsert por mp_subscription_id
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Mapeamento de status MP → subscription_status ─────────────────────────────

const MP_STATUS_MAP: Record<string, string> = {
  authorized:   'active',
  paused:       'past_due',
  cancelled:    'cancelled',
  pending:      'trial',
}

// ── Validação de assinatura MP ────────────────────────────────────────────────

function validateMercadoPagoSignature(
  req: NextRequest,
  rawBody: string,
  notificationId: string,
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook/mp] MP_WEBHOOK_SECRET não configurado')
    return false
  }

  const xSignature  = req.headers.get('x-signature') ?? ''
  const xRequestId  = req.headers.get('x-request-id') ?? ''

  // Extrai ts e v1 do header x-signature
  const parts: Record<string, string> = {}
  for (const part of xSignature.split(',')) {
    const [key, val] = part.split('=')
    if (key && val) parts[key.trim()] = val.trim()
  }

  const { ts, v1 } = parts
  if (!ts || !v1) return false

  // Mensagem para HMAC conforme documentação MP
  const message = `id:${notificationId};request-id:${xRequestId};ts:${ts}`
  const expected = createHmac('sha256', secret).update(message).digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(v1,       'utf8'),
      Buffer.from(expected, 'utf8'),
    )
  } catch {
    return false
  }
}

// ── Busca professional pelo mp_subscription_id ────────────────────────────────

async function getProfessionalBySubscription(
  mpSubscriptionId: string,
): Promise<string | null> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('subscriptions')
    .select('professional_id')
    .eq('mp_subscription_id', mpSubscriptionId)
    .maybeSingle()

  return data?.professional_id ?? null
}

// ── Handler POST ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Bad Request: JSON inválido', { status: 400 })
  }

  // MP envia id da notificação no body ou como query param
  const notificationId =
    (body.id as string) ??
    new URL(req.url).searchParams.get('id') ??
    ''

  // ── Validar assinatura ────────────────────────────────────────────────────
  if (!validateMercadoPagoSignature(req, rawBody, notificationId)) {
    console.warn('[webhook/mp] Assinatura inválida — possível requisição não autorizada')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // MP usa 'type' e 'action' para descrever o evento
  const type   = body.type as string | undefined
  const action = body.action as string | undefined

  // Processar apenas eventos de subscription
  if (!type?.includes('subscription_preapproval') && !action?.includes('subscription')) {
    // Evento desconhecido — retornar 200 para MP não reenviar
    return new NextResponse('OK', { status: 200 })
  }

  // Busca detalhes da subscription via API MP
  const dataId = (body.data as Record<string, unknown>)?.id as string | undefined
  if (!dataId) {
    return new NextResponse('OK', { status: 200 })
  }

  const subscriptionDetails = await fetchMpSubscription(dataId)
  if (!subscriptionDetails) {
    // Falha ao buscar — log e retorna 200 (MP irá retentar)
    console.error('[webhook/mp] Falha ao buscar subscription:', dataId)
    return new NextResponse('OK', { status: 200 })
  }

  const { id: mpSubscriptionId, status: mpStatus, external_reference } = subscriptionDetails
  const laraStatus = MP_STATUS_MAP[mpStatus] ?? 'past_due'

  const supabase = createAdminClient()

  // Tenta encontrar professional pelo external_reference (professional_id) ou mp_subscription_id
  let professionalId: string | null =
    external_reference ?? (await getProfessionalBySubscription(mpSubscriptionId))

  if (!professionalId) {
    console.warn('[webhook/mp] Não foi possível associar subscription ao professional:', mpSubscriptionId)
    return new NextResponse('OK', { status: 200 })
  }

  // ── Upsert subscription ───────────────────────────────────────────────────
  //
  // DISTINÇÃO CRÍTICA:
  //   status='cancelled'  → término DEFINITIVO da assinatura (este webhook)
  //   is_paused=true      → suspensão TEMPORÁRIA (controlada por token_invalid >7 dias)
  //   São estados independentes — NÃO misturar.
  const now = new Date().toISOString()

  const { error: upsertError } = await supabase
    .from('subscriptions')
    .upsert(
      {
        professional_id:    professionalId,
        mp_subscription_id: mpSubscriptionId,
        status:             laraStatus,
        // cancelled_at: apenas em cancelamento definitivo (ver 0006_subscriptions_unique.sql)
        ...(laraStatus === 'cancelled' ? { cancelled_at: now }      : {}),
        // mp_paused_at: quando MP pausou a cobrança (ex: cartão recusado)
        ...(mpStatus   === 'paused'    ? { mp_paused_at: now }       : {}),
      },
      { onConflict: 'professional_id' },
    )

  if (upsertError) {
    console.error('[webhook/mp] Upsert subscriptions falhou:', upsertError.message, 'professional:', professionalId)
    // Retorna 500 para MP retentar
    return new NextResponse('Internal Server Error', { status: 500 })
  }

  // Cancelamento: NÃO toca is_paused — esse campo é controlado por outra lógica
  // (token_invalid >7 dias → billing_paused_at em professionals).
  // O acesso via dashboard expira naturalmente quando status='cancelled'.

  console.log(
    `[webhook/mp] Subscription atualizada — professional: ${professionalId}, status: ${laraStatus}`
  )

  return new NextResponse('OK', { status: 200 })
}

// ── Busca detalhes de subscription via API MP ─────────────────────────────────

interface MpSubscription {
  id: string
  status: string
  external_reference?: string
}

async function fetchMpSubscription(id: string): Promise<MpSubscription | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    console.error('[webhook/mp] MP_ACCESS_TOKEN não configurado')
    return null
  }

  try {
    const res = await fetch(
      `https://api.mercadopago.com/preapproval/${id}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      },
    )

    if (!res.ok) return null
    return (await res.json()) as MpSubscription
  } catch {
    return null
  }
}
