export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export default async function AdminSupportPage() {
  const supabase = createAdminClient()
  const { data: handovers } = await supabase
    .from('human_handovers')
    .select('id, started_at, professional_id, contact_id, professionals(name, phone_number), contacts(name, phone_number)')
    .eq('status', 'active')
    .order('started_at', { ascending: true })

  const warningThreshold = new Date(Date.now() - 30 * 60_000).toISOString()

  type HandoverRow = { id: string; started_at: string; professional_id: string; professionals: { name: string; phone_number: string } | null; contacts: { name: string | null; phone_number: string } | null }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Suporte — Handovers ativos</h1>
      {((handovers ?? []).length === 0) && <p className="text-sm text-gray-500">Nenhum handover ativo no momento. ✅</p>}
      <div className="space-y-2">
        {((handovers ?? []) as unknown as HandoverRow[]).map(h => {
          const isLate = h.started_at < warningThreshold
          return (
            <div key={h.id} className={`flex items-center justify-between rounded-2xl border p-4 ${isLate ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {h.professionals?.name ?? '—'} → {h.contacts?.name ?? h.contacts?.phone_number ?? '—'}
                  {isLate && <span className="ml-2 text-amber-600">⚠️ há mais de 30min</span>}
                </p>
                <p className="text-xs text-gray-400">{new Date(h.started_at).toLocaleString('pt-BR')}</p>
              </div>
              <Link href={`/admin/professionals/${h.professional_id}`} className="text-xs text-rose-500 hover:underline">Ver profissional</Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
