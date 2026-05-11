/**
 * POST /api/n8n/media-cleanup
 * Endpoint chamado pelo cron do n8n (flow_media_retention.yaml) para
 * deletar mídias expiradas do Supabase Storage.
 *
 * Autenticado via Bearer N8N_WEBHOOK_SECRET.
 * Chamado diariamente às 04:00 (configurado no n8n).
 *
 * maxDuration: 60s — pode processar até 500 mídias por execução.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredMedia }        from '@/lib/media/retention'

export const maxDuration = 60

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Autenticação ──────────────────────────────────────────────────────────
  const authHeader  = req.headers.get('authorization')
  const secret      = process.env.N8N_WEBHOOK_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Parâmetros opcionais ──────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as { retention_days?: number }
  const retentionDays = typeof body.retention_days === 'number'
    ? Math.min(Math.max(body.retention_days, 1), 365) // entre 1 e 365 dias
    : 90

  // ── Execução ──────────────────────────────────────────────────────────────
  console.log(`[media-cleanup] Iniciando limpeza — retentionDays=${retentionDays}`)
  const start  = Date.now()
  const result = await cleanupExpiredMedia(retentionDays)
  const ms     = Date.now() - start

  console.log(`[media-cleanup] Concluído em ${ms}ms — deleted=${result.deleted}, errors=${result.errors}`)

  return NextResponse.json({
    ok:            true,
    deleted:       result.deleted,
    errors:        result.errors,
    retention_days: retentionDays,
    duration_ms:   ms,
  })
}
