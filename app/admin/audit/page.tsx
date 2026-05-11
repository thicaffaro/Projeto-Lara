/**
 * /app/admin/audit/page.tsx
 * Auditoria — filtra audit_log por profissional, evento e decisão da Lara.
 *
 * lara_mode_decision foi adicionado à tabela audit_log em 0011_dashboard_extras.sql
 * (coluna nullable — eventos anteriores e não relacionados à Lara terão NULL).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

const LARA_DECISIONS = [
  'responded', 'silent_personal', 'silent_paused',
  'silent_blocked', 'silent_out_of_scope',
]

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    prof?: string; event?: string; decision?: string
    from?: string; to?: string; page?: string
  }>
}) {
  const params   = await searchParams
  const supabase = createAdminClient()
  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('audit_log')
    .select('id, created_at, actor, action, lara_mode_decision, professional_id, new_data, table_name, professionals(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (params.prof)     query = query.eq('professional_id', params.prof)
  if (params.event)    query = query.ilike('action', `%${params.event}%`)
  if (params.decision) query = query.eq('lara_mode_decision', params.decision)
  if (params.from)     query = query.gte('created_at', params.from)
  if (params.to)       query = query.lte('created_at', params.to + 'T23:59:59Z')

  const { data: logs, count } = await query

  // Busca lista de profissionais para o select de filtro
  const { data: profList } = await supabase
    .from('professionals')
    .select('id, name')
    .order('name')
    .limit(200)

  type AuditRow = {
    id: string; created_at: string; actor: string; action: string
    lara_mode_decision: string | null; table_name: string | null
    professional_id: string | null
    professionals: { name: string } | null
    new_data: unknown
  }
  type ProfItem = { id: string; name: string }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  function filterUrl(extra: Record<string, string>) {
    const q = new URLSearchParams()
    if (params.prof)     q.set('prof', params.prof)
    if (params.event)    q.set('event', params.event)
    if (params.decision) q.set('decision', params.decision)
    if (params.from)     q.set('from', params.from)
    if (params.to)       q.set('to', params.to)
    Object.entries(extra).forEach(([k, v]) => v ? q.set(k, v) : q.delete(k))
    return '/admin/audit?' + q.toString()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Auditoria</h1>

      {/* Filtros */}
      <form method="get" action="/admin/audit" className="flex flex-wrap gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Profissional</label>
          <select name="prof" defaultValue={params.prof ?? ''}
            className="h-9 rounded-xl border border-gray-200 px-2 text-sm">
            <option value="">Todas</option>
            {((profList ?? []) as unknown as ProfItem[]).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Decisão da Lara</label>
          <select name="decision" defaultValue={params.decision ?? ''}
            className="h-9 rounded-xl border border-gray-200 px-2 text-sm">
            <option value="">Todas</option>
            {LARA_DECISIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Evento</label>
          <input name="event" defaultValue={params.event ?? ''} placeholder="ex: message_inbound"
            className="h-9 rounded-xl border border-gray-200 px-2 text-sm w-40" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">De</label>
          <input type="date" name="from" defaultValue={params.from ?? ''}
            className="h-9 rounded-xl border border-gray-200 px-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Até</label>
          <input type="date" name="to" defaultValue={params.to ?? ''}
            className="h-9 rounded-xl border border-gray-200 px-2 text-sm" />
        </div>
        <div className="flex items-end">
          <button type="submit"
            className="h-9 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white">
            Filtrar
          </button>
        </div>
        {(params.prof || params.decision || params.event || params.from || params.to) && (
          <div className="flex items-end">
            <Link href="/admin/audit" className="h-9 flex items-center rounded-xl border border-gray-200 px-4 text-sm text-gray-500">
              Limpar
            </Link>
          </div>
        )}
      </form>

      {/* Contagem */}
      {count !== null && (
        <p className="text-xs text-gray-400">
          {count} evento{count !== 1 ? 's' : ''} encontrado{count !== 1 ? 's' : ''}
          {totalPages > 1 && ` — página ${page} de ${totalPages}`}
        </p>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              {['Timestamp', 'Actor', 'Evento', 'Tabela', 'Decisão Lara', 'Profissional', 'Dados'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {((logs ?? []) as unknown as AuditRow[]).map(log => (
              <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="whitespace-nowrap px-3 py-2 text-gray-400">
                  {new Date(log.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2 text-gray-600">{log.actor}</td>
                <td className="px-3 py-2 font-mono text-gray-900">
                  <Link href={filterUrl({ event: log.action, page: '1' })}
                    className="hover:text-rose-600 hover:underline">{log.action}</Link>
                </td>
                <td className="px-3 py-2 text-gray-400">{log.table_name ?? '—'}</td>
                <td className="px-3 py-2">
                  {log.lara_mode_decision ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      log.lara_mode_decision === 'responded'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>{log.lara_mode_decision}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {log.professionals?.name ? (
                    <Link href={`/admin/professionals/${log.professional_id ?? ''}`}
                      className="hover:text-rose-600 hover:underline">{log.professionals.name}</Link>
                  ) : '—'}
                </td>
                <td className="px-3 py-2">
                  {log.new_data ? (
                    <details>
                      <summary className="cursor-pointer text-gray-400 hover:text-gray-700">ver</summary>
                      <pre className="mt-1 max-w-xs overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-600">
                        {JSON.stringify(log.new_data, null, 2)}
                      </pre>
                    </details>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(logs ?? []).length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">Nenhum evento encontrado.</p>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={filterUrl({ page: String(page - 1) })}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              ← Anterior
            </Link>
          )}
          {page < totalPages && (
            <Link href={filterUrl({ page: String(page + 1) })}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Próxima →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
