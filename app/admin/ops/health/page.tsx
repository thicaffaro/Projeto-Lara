export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminOpsHealthPage() {
  const supabase = createAdminClient()
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()

  const [{ count: dlqPending }, { count: activeHandovers }, { data: latencyData }] = await Promise.all([
    supabase.from('webhook_dlq').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('human_handovers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('messages').select('latency_ms').not('latency_ms', 'is', null).gte('created_at', since24h).limit(1000),
  ])

  const latencies = ((latencyData ?? []) as unknown as { latency_ms: number }[]).map(m => m.latency_ms).sort((a,b) => a-b)
  const p50  = latencies[Math.floor(latencies.length * 0.5)] ?? 0
  const p95  = latencies[Math.floor(latencies.length * 0.95)] ?? 0
  const p99  = latencies[Math.floor(latencies.length * 0.99)] ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Saúde do sistema</h1>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'p50 latência', value: `${p50}ms` },
          { label: 'p95 latência', value: `${p95}ms` },
          { label: 'p99 latência', value: `${p99}ms` },
          { label: 'DLQ pendente', value: dlqPending ?? 0, warn: (dlqPending ?? 0) > 0 },
          { label: 'Handovers ativos', value: activeHandovers ?? 0, warn: (activeHandovers ?? 0) > 5 },
          { label: 'Amostras 24h', value: latencies.length },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl border p-5 ${('warn' in k && k.warn) ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            <p className="mt-1 text-xs text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
