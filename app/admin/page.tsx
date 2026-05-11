/**
 * /admin/page.tsx — Visão geral com KPIs, alertas e gráficos.
 *
 * Server Component: busca dados no banco.
 * AdminBarChart é um Client Component ('use client') que encapsula Recharts.
 * No App Router, importar um Client Component de um Server Component é o padrão
 * correto — Next.js gerencia o boundary server/client automaticamente.
 * Recharts (que usa APIs DOM) fica no bundle do cliente, não é executado no servidor.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminBarChart }    from './_components/AdminBarChart'

const PLAN_PRICE = 99

async function fetchAdminData() {
  const supabase      = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const [
    { count: active },
    { count: inTrial },
    { count: churn30 },
    { data: dlqData },
    { data: handovers },
    { data: profList },
  ] = await Promise.all([
    supabase.from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('whatsapp_status', 'connected'),
    supabase.from('professionals')
      .select('id', { count: 'exact', head: true })
      .not('trial_ends_at', 'is', null)
      .gt('trial_ends_at', new Date().toISOString()),
    supabase.from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('whatsapp_status', 'disconnected')
      .gt('whatsapp_status_changed_at', thirtyDaysAgo),
    supabase.from('webhook_dlq')
      .select('id', { count: 'exact', head: false })
      .eq('status', 'pending')
      .limit(1),
    supabase.from('human_handovers')
      .select('id, started_at, professional_id')
      .eq('status', 'active')
      .lt('started_at', new Date(Date.now() - 60 * 60_000).toISOString()),
    supabase.from('professionals')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  return {
    active:          active          ?? 0,
    inTrial:         inTrial         ?? 0,
    churn30:         churn30         ?? 0,
    dlqPending:      (dlqData        ?? []).length,
    overdueHandovers:(handovers      ?? []).length,
    profList:        profList        ?? [],
  }
}

export default async function AdminPage() {
  const { active, inTrial, churn30, dlqPending, overdueHandovers, profList } =
    await fetchAdminData()
  const mrr = active * PLAN_PRICE

  const kpis = [
    { label: 'Profissionais ativas', value: active,   color: 'text-green-600' },
    { label: 'Em trial',             value: inTrial,  color: 'text-blue-600'  },
    { label: 'MRR estimado',         value: `R$ ${mrr.toLocaleString('pt-BR')}`, color: 'text-rose-600' },
    { label: 'Churn 30d',            value: churn30,  color: 'text-red-600'   },
  ]

  type ProfRow = { id: string; created_at: string }
  const byMonth: Record<string, number> = {}
  for (const p of profList as unknown as ProfRow[]) {
    const month = p.created_at?.slice(0, 7)
    if (month) byMonth[month] = (byMonth[month] ?? 0) + 1
  }
  const chartData = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, count]) => ({ month, count }))

  const alerts = [
    dlqPending > 0 && {
      msg: `🟠 DLQ com ${dlqPending} mensagem(ns) pendente(s)`,
    },
    overdueHandovers > 0 && {
      msg: `🟠 ${overdueHandovers} handover(s) ativo(s) há > 1h`,
    },
  ].filter(Boolean) as { msg: string }[]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Visão geral</h1>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(kpi => (
          <div key={kpi.label}
            className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-1 text-xs font-medium text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico (Client Component — ssr: false) */}
      <AdminBarChart data={chartData} />
    </div>
  )
}
