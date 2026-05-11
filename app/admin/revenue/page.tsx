import { createAdminClient } from '@/lib/supabase/admin'

const PLAN_PRICE = 99

export default async function AdminRevenuePage() {
  const supabase = createAdminClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [{ count: active }, { count: trial }, { data: paused }] = await Promise.all([
    supabase.from('professionals').select('id', { count: 'exact', head: true }).eq('whatsapp_status', 'connected'),
    supabase.from('professionals').select('id', { count: 'exact', head: true }).not('trial_ends_at', 'is', null).gt('trial_ends_at', new Date().toISOString()),
    supabase.from('professionals').select('id, name, phone_number, billing_paused_at').not('billing_paused_at', 'is', null),
  ])

  const mrr = (active ?? 0) * PLAN_PRICE

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Receita</h1>
      <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-4 py-2">MVP: MRR estimado (sem tabela subscriptions). Integração Mercado Pago real no Prompt E.</p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'MRR estimado', value: `R$ ${mrr.toLocaleString('pt-BR')}` },
          { label: 'Ativas (pagantes)', value: active ?? 0 },
          { label: 'Em trial', value: trial ?? 0 },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            <p className="mt-1 text-xs text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>
      {(paused ?? []).length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-white p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">⚠️ Cobranças pausadas ({(paused ?? []).length})</p>
          <table className="w-full text-sm"><tbody>
            {(paused ?? []).map((p: unknown) => {
              const pr = p as { id: string; name: string; phone_number: string; billing_paused_at: string }
              return (
                <tr key={pr.id} className="border-b border-gray-50">
                  <td className="py-2">{pr.name}</td>
                  <td className="py-2 text-gray-400">{pr.phone_number}</td>
                  <td className="py-2 text-red-500">{new Date(pr.billing_paused_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              )
            })}
          </tbody></table>
        </div>
      )}
    </div>
  )
}
