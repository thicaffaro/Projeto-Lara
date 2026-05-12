/**
 * POST /api/n8n/health-metrics
 * Cron a cada hora (flow_health_metrics no n8n).
 *
 * Agrega métricas da última hora e salva em ops_metrics_hourly.
 * Schema existente: { hour_bucket, metric_name, metric_value, professional_id?, metadata? }
 * — uma linha por métrica por hora.
 *
 * Métricas coletadas:
 *   messages_inbound     — total de inbounds na última hora
 *   messages_responded   — inbounds com lara_mode_decision='responded'
 *   messages_silent      — inbounds com lara_mode_decision LIKE 'silent_%'
 *   response_rate        — % respondidos (0-100)
 *   latency_p50          — p50 latência ms
 *   latency_p95          — p95 latência ms
 *   dlq_pending          — webhook_dlq com status pendente
 *   active_handovers     — human_handovers ativos
 *
 * maxDuration: 30s
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }        from '@/lib/supabase/admin'

export const maxDuration = 30

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Autenticação
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.N8N_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase   = createAdminClient()
  const now        = new Date()
  // Início da hora anterior (bucket)
  const hourBucket = new Date(now)
  hourBucket.setMinutes(0, 0, 0)
  const oneHourAgo = new Date(hourBucket.getTime() - 3_600_000)

  const since = oneHourAgo.toISOString()
  const until = hourBucket.toISOString()

  // ── Coletar métricas em paralelo ──────────────────────────────────────────
  const [
    { count: inbound },
    { count: responded },
    { count: silent },
    { data: latencyData },
    { count: dlqPending },
    { count: activeHandovers },
  ] = await Promise.all([
    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .gte('created_at', since)
      .lt('created_at',  until),

    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .eq('lara_mode_decision', 'responded')
      .gte('created_at', since)
      .lt('created_at',  until),

    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .like('lara_mode_decision', 'silent_%')
      .gte('created_at', since)
      .lt('created_at',  until),

    supabase.rpc('get_latency_percentiles', { p_since: since }),

    supabase.from('webhook_dlq')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null),

    supabase.from('human_handovers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
  ])

  const totalInbound = inbound    ?? 0
  const totalResp    = responded  ?? 0
  const totalSilent  = silent     ?? 0
  const respRate     = totalInbound > 0
    ? Math.round((totalResp / totalInbound) * 100)
    : 0

  type LatencyRow = { p50: number | null; p95: number | null }
  const latency = (latencyData as unknown as LatencyRow[] | null)?.[0]

  // ── Inserir métricas (uma linha por métrica) ──────────────────────────────
  const bucket = hourBucket.toISOString()
  const metrics = [
    { metric_name: 'messages_inbound',   metric_value: totalInbound },
    { metric_name: 'messages_responded', metric_value: totalResp    },
    { metric_name: 'messages_silent',    metric_value: totalSilent  },
    { metric_name: 'response_rate_pct',  metric_value: respRate     },
    { metric_name: 'dlq_pending',        metric_value: dlqPending ?? 0        },
    { metric_name: 'active_handovers',   metric_value: activeHandovers ?? 0   },
    ...(latency?.p50 != null ? [{ metric_name: 'latency_p50_ms', metric_value: latency.p50 }] : []),
    ...(latency?.p95 != null ? [{ metric_name: 'latency_p95_ms', metric_value: latency.p95 }] : []),
  ].map(m => ({ ...m, hour_bucket: bucket }))

  const { error: insertErr } = await supabase
    .from('ops_metrics_hourly')
    .upsert(metrics, { onConflict: 'hour_bucket,metric_name,professional_id' })

  if (insertErr) {
    console.error('[health-metrics] upsert error:', insertErr.message)
    // Não falha — apenas loga
  }

  console.log('[health-metrics] bucket:', bucket, { totalInbound, totalResp, respRate, dlqPending, activeHandovers })

  return NextResponse.json({
    bucket,
    messages_inbound:   totalInbound,
    messages_responded: totalResp,
    response_rate:      `${respRate}%`,
    dlq_pending:        dlqPending ?? 0,
    active_handovers:   activeHandovers ?? 0,
    latency_p50_ms:     latency?.p50 ?? null,
    latency_p95_ms:     latency?.p95 ?? null,
    saved:              !insertErr,
  })
}
