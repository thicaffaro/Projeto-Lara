/**
 * /app/admin/revenue/page.tsx
 * Visão de receita baseada na tabela subscriptions (dados reais de status MP).
 */
import { createAdminClient } from '@/lib/supabase/admin'

const PLAN_PRICE = 99

type SubWithProf = {
  id: string; status: string; created_at: string
  cancelled_at: string | null; mp_paused_at: string | null
  professionals: { id: string; name: string; phone_number: string; billing_paused_at: string | null } | null
}

export default async function AdminRevenuePage() {
  const supabase  = createAdminClient()
  const now       = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd = monthStart

  const [
    { data: activeSubs },
    { count: trialCount },
    { count: cancelledThisMonth },
    { count: cancelledLastMonth },
    { data: pausedBilling },
  ] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, status, created_at, cancelled_at, mp_paused_at, professionals(id, name, phone_number, billing_paused_at)')
      .eq('status', 'active'),

    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['trial', 'trial_pending_templates']),

    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cancelled')
      .gte('cancelled_at', monthStart),

    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cancelled')
      .gte('cancelled_at', lastMonth)
      .lt('cancelled_at', lastMonthEnd),

    supabase
      .from('professionals')
      .select('id, name, phone_number, billing_paused_at')
      .not('billing_paused_at', 'is', null)
      .order('billing_paused_at'),
  ])

  const active = (activeSubs ?? []) as unknown as SubWithProf[]
  const mrr    = active.length * PLAN_PRICE

  // Churn rate: cancelamentos este mês / ativas no início do mês (aproximado)
  const churnBase  = active.length + (cancelledThisMonth ?? 0)
  const churnRate  = churnBase > 0 ? ((cancelledThisMonth ?? 0) / churnBase * 100).toFixed(1) : '0.0'
  const churnLastMonth = cancelledLastMonth ?? 0

  // Cohort: distributed by month of creation
  const byMonth: Record<string, number> = {}
  for (const s of active) {
    const month = s.created_at?.slice(0, 7)
    if (month) byMonth[month] = (byMonth[month] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Receita</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'MRR',              value: `R$ ${mrr.toLocaleString('pt-BR')}`, color: 'text-rose-600' },
          { label: 'Ativas (pagantes)', value: active.length,                      color: 'text-green-600' },
          { label: 'Em trial',         value: trialCount ?? 0,                     color: 'text-blue-600'  },
          { label: 'Churn este mês',   value: `${cancelledThisMonth ?? 0} (${churnRate}%)`, color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="mt-1 text-xs text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Comparativo */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Cancelamentos</p>
        <div className="flex gap-8">
          <div>
            <p className="text-2xl font-bold text-red-600">{cancelledThisMonth ?? 0}</p>
            <p className="text-xs text-gray-400">Este mês</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-400">{churnLastMonth}</p>
            <p className="text-xs text-gray-400">Mês passado</p>
          </div>
        </div>
      </div>

      {/* Assinaturas ativas por mês de início */}
      {Object.keys(byMonth).length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Ativas por mês de início</p>
          <div className="space-y-2">
            {Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, cnt]) => (
              <div key={month} className="flex items-center gap-3">
                <span className="w-16 text-xs text-gray-400">{month}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-rose-400"
                    style={{ width: `${Math.min(100, (cnt / (active.length || 1)) * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-600 w-6 text-right">{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cobranças pausadas */}
      {(pausedBilling ?? []).length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-white p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">
            ⚠️ Cobranças pausadas ({(pausedBilling ?? []).length})
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Nome', 'Telefone', 'Pausada em'].map(h => (
                  <th key={h} className="pb-2 text-left text-xs font-semibold text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(pausedBilling ?? []).map(p => {
                const pr = p as { id: string; name: string; phone_number: string; billing_paused_at: string }
                return (
                  <tr key={pr.id} className="border-t border-gray-50">
                    <td className="py-2 font-medium">{pr.name}</td>
                    <td className="py-2 text-gray-400">{pr.phone_number}</td>
                    <td className="py-2 text-red-500">
                      {new Date(pr.billing_paused_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
