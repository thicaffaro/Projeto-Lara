/**
 * /admin/page.tsx — Visão geral com KPIs, alertas e gráficos.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const PLAN_PRICE = 99 // R$ por profissional ativa

async function fetchAdminData() {
  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const [
    { count: active },
    { count: inTrial },
    { count: churn30 },
    { data: dlqData },
    { data: handovers },
    { data: profList },
  ] = await Promise.all([
    supabase.from('professionals').select('id', { count: 'exact', head: true }).eq('whatsapp_status', 'connected'),
    supabase.from('professionals').select('id', { count: 'exact', head: true }).not('trial_ends_at', 'is', null).gt('trial_ends_at', new Date().toISOString()),
    supabase.from('professionals').select('id', { count: 'exact', head: true }).eq('whatsapp_status', 'disconnected').gt('whatsapp_status_changed_at', thirtyDaysAgo),
    supabase.from('webhook_dlq').select('id', { count: 'exact', head: false }).eq('status', 'pending').limit(1),
    supabase.from('human_handovers').select('id, started_at, professional_id').eq('status', 'active').lt('started_at', new Date(Date.now() - 60 * 60_000).toISOString()),
    supabase.from('professionals').select('id, name, specialty, service_mode, whatsapp_status, default_lara_mode, created_at').order('created_at', { ascending: false }).limit(200),
  ])

  return { active: active ?? 0, inTrial: inTrial ?? 0, churn30: churn30 ?? 0,
           dlqPending: (dlqData ?? []).length, overdueHandovers: (handovers ?? []).length, profList: profList ?? [] }
}

export default async function AdminPage() {
  const { active, inTrial, churn30, dlqPending, overdueHandovers, profList } = await fetchAdminData()
  const mrr = active * PLAN_PRICE

  const kpis = [
    { label: 'Profissionais ativas', value: active,    color: 'text-green-600' },
    { label: 'Em trial',             value: inTrial,   color: 'text-blue-600'  },
    { label: 'MRR estimado',         value: `R$ ${mrr.toLocaleString('pt-BR')}`, color: 'text-rose-600' },
    { label: 'Churn 30d',            value: churn30,   color: 'text-red-600'   },
  ]

  type ProfRow = { id: string; created_at: string }
  const byMonth: Record<string, number> = {}
  for (const p of profList as unknown as ProfRow[]) {
    const month = p.created_at?.slice(0, 7)
    if (month) byMonth[month] = (byMonth[month] ?? 0) + 1
  }
  const chartData = Object.entries(byMonth).slice(-6).map(([month, count]) => ({ month, count }))

  const alerts = [
    dlqPending > 0 && { level: 'orange', msg: `🟠 DLQ com ${dlqPending} mensagem(ns) pendente(s)` },
    overdueHandovers > 0 && { level: 'orange', msg: `🟠 ${overdueHandovers} handover(s) ativo(s) há > 1h` },
  ].filter(Boolean) as { level: string; msg: string }[]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Visão geral</h1>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{a.msg}</div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-1 text-xs font-medium text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de novos cadastros */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="mb-4 text-sm font-semibold text-gray-700">Novos cadastros por mês</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f43f5e" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
