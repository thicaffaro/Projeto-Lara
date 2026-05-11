/**
 * POST /api/n8n/flow-inbound
 * Endpoint chamado pelo n8n após receber webhook do WhatsApp.
 *
 * Autenticado via Bearer N8N_WEBHOOK_SECRET.
 * Executa flowInbound e retorna resultado para o n8n logar.
 */

import { NextRequest, NextResponse } from 'next/server'
import { flowInbound, type InboundPayload } from '@/lib/ai/flowInbound'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Autenticação ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!process.env.N8N_WEBHOOK_SECRET || authHeader !== `Bearer ${process.env.N8N_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Validação do payload ──────────────────────────────────────────────────
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const p = payload as Record<string, unknown>

  if (!p.phone_number || !p.message_id || !p.waba_id || !p.message_text) {
    return NextResponse.json(
      { error: 'invalid_payload', required: ['phone_number', 'message_id', 'waba_id', 'message_text'] },
      { status: 400 }
    )
  }

  const inbound: InboundPayload = {
    phone_number:  String(p.phone_number),
    message_text:  String(p.message_text),
    message_id:    String(p.message_id),
    waba_id:       String(p.waba_id),
    timestamp:     Number(p.timestamp ?? Math.floor(Date.now() / 1000)),
  }

  // ── Executa flow ──────────────────────────────────────────────────────────
  try {
    const result = await flowInbound(inbound)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[n8n/flow-inbound] unhandled error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
