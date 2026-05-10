/**
 * /app/api/webhooks/instagram/route.ts
 * Stub — Integração Instagram DM fora do MVP.
 *
 * GET  — Verificação padrão (mantém webhook registrado na Meta)
 * POST — HMAC validado + log em audit_log + retorna 200 sem encaminhar
 *
 * Quando ativar: substituir forwardToN8n stub por lógica real
 * e remover o comentário "instagram_stub_ignored" do audit_log.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// ── GET — Verificação do webhook ──────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Instagram usa o mesmo META_VERIFY_TOKEN do WhatsApp
  const expectedToken = process.env.META_VERIFY_TOKEN
  if (!expectedToken || token !== expectedToken) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ── POST — Stub: valida HMAC e descarta ───────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()

  // ── Validar HMAC (obrigatório mesmo para stub — segurança em profundidade) ──
  const sigHeader = req.headers.get('x-hub-signature-256')
  if (!sigHeader) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET
  if (!appSecret) {
    console.error('[webhook/instagram] INSTAGRAM_APP_SECRET não configurado')
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
    console.warn('[webhook/instagram] HMAC inválido')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // ── Log em audit_log: rastreia volume sem processar ──────────────────────
  // Útil para verificar quando ativar a integração real
  try {
    const supabase = createAdminClient()
    await supabase.from('audit_log').insert({
      actor: 'system',
      action: 'instagram_stub_ignored',
      table_name: 'instagram_accounts',
      new_data: {
        note: 'Integração Instagram fora do MVP. Ativar pós-MVP.',
        received_at: new Date().toISOString(),
      },
    })
  } catch (logErr) {
    // Log falhou — não bloqueia a resposta
    const msg = logErr instanceof Error ? logErr.message : 'erro desconhecido'
    console.error('[webhook/instagram] audit_log INSERT falhou:', msg)
  }

  // Retorna 200 sem encaminhar — Meta não reenviará
  return new NextResponse('OK', { status: 200 })
}
