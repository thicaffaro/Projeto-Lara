export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminOpsTemplatesPage() {
  const supabase = createAdminClient()
  const { data: templates } = await supabase
    .from('templates')
    .select('id, name, variant, status, professional_id, submitted_at, approved_at, rejection_reason, professionals(name, phone_number)')
    .order('submitted_at', { ascending: false })
    .limit(200)

  const STATUS_COLOR: Record<string, string> = {
    approved: 'text-green-700 bg-green-50', rejected: 'text-red-700 bg-red-50',
    pending: 'text-amber-700 bg-amber-50', paused: 'text-gray-700 bg-gray-50',
  }

  type TRow = { id: string; name: string; variant: string; status: string; professionals: { name: string; phone_number: string } | null; submitted_at: string | null; rejection_reason: string | null }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Templates Meta</h1>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>{['Profissional','Template','Variante','Status','Enviado','Rejeição'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {((templates ?? []) as unknown as TRow[]).map(t => (
              <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2 text-xs">{t.professionals?.name ?? '—'}</td>
                <td className="px-4 py-2 text-xs font-mono">{t.name}</td>
                <td className="px-4 py-2 text-xs font-bold text-rose-500">{t.variant?.toUpperCase()}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[t.status] ?? 'text-gray-500'}`}>{t.status}</span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-400">{t.submitted_at ? new Date(t.submitted_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td className="px-4 py-2 text-xs text-red-500 max-w-48 truncate">{t.rejection_reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
