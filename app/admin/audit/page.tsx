import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ prof?: string; event?: string }> }) {
  const params  = await searchParams
  const supabase = createAdminClient()

  let query = supabase
    .from('audit_log')
    .select('id, created_at, actor, action, lara_mode_decision, professional_id, new_data, professionals(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (params.prof) query = query.eq('professional_id', params.prof)
  if (params.event) query = query.eq('action', params.event)

  const { data: logs } = await query

  type AuditRow = { id: string; created_at: string; actor: string; action: string; lara_mode_decision: string | null; professionals: { name: string } | null; new_data: unknown }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Auditoria</h1>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>{['Timestamp','Actor','Evento','Decisão Lara','Profissional'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-gray-400">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {((logs ?? []) as unknown as AuditRow[]).map(log => (
              <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-gray-500">{log.actor}</td>
                <td className="px-3 py-2 font-mono text-gray-900">{log.action}</td>
                <td className="px-3 py-2 text-gray-500">{log.lara_mode_decision ?? '—'}</td>
                <td className="px-3 py-2 text-gray-500">{log.professionals?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
