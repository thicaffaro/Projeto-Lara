/**
 * POST /api/n8n/audit-archive
 * Cron mensal — dia 1 às 3h (flow_audit_log_archive no n8n).
 *
 * MVP: apenas identifica partições candidatas a archive e conta registros antigos.
 * Não faz DETACH automático — operação de DBA que exige janela de manutenção.
 *
 * Política: partições de audit_log com mais de 6 meses são candidatas.
 * Partições de messages e appointments são retidas por 12 meses (LGPD).
 *
 * Pós-MVP: implementar DETACH PARTITION + INSERT INTO audit_log_archive.
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

  const supabase = createAdminClient()
  const now      = new Date()

  // Calcular partição candidata (6 meses atrás)
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const year  = sixMonthsAgo.getFullYear()
  const month = String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')
  const partitionSuffix   = `${year}_${month}`
  const candidatePartition = `audit_log_${partitionSuffix}`

  // Contar registros antigos nas principais tabelas particionadas
  const cutoff = sixMonthsAgo.toISOString()

  const [
    { count: auditOld },
    { count: messagesOld },
  ] = await Promise.all([
    supabase.from('audit_log')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoff),
    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoff),
  ])

  const report = {
    run_at:            now.toISOString(),
    candidate_partition: candidatePartition,
    cutoff_date:       cutoff,
    audit_log_old_count:  auditOld   ?? 0,
    messages_old_count:   messagesOld ?? 0,
    action:            'logged_only_mvp',
    next_action:       'DETACH PARTITION audit_log_' + partitionSuffix + ' — executar manualmente em janela de manutenção',
  }

  console.log('[audit-archive]', report)

  // Salvar relatório em ops_metrics_hourly para histórico
  await supabase.from('ops_metrics_hourly').insert([
    {
      hour_bucket:  now.toISOString(),
      metric_name:  'audit_log_old_records',
      metric_value: auditOld ?? 0,
      metadata:     { partition: candidatePartition },
    },
    {
      hour_bucket:  now.toISOString(),
      metric_name:  'messages_old_records',
      metric_value: messagesOld ?? 0,
      metadata:     { cutoff },
    },
  ]).then(null, (e: Error) =>
    console.error('[audit-archive] ops_metrics insert falhou:', e.message)
  )

  return NextResponse.json(report)
}
