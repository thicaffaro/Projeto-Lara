import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

const STATUS_BADGE: Record<string, string> = {
  connected:     '🟢',
  token_invalid: '🟡',
  disconnected:  '🔴',
  trial_pending_templates: '🔵',
}

export default async function AdminProfessionalsPage() {
  const supabase = createAdminClient()
  const { data: rawProfs } = await supabase
    .from('professionals')
    .select('id, name, phone_number, specialty, service_mode, whatsapp_status, default_lara_mode, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200)

  type ProfRow = { id: string; name: string; phone_number: string; specialty: string; service_mode: string; whatsapp_status: string; default_lara_mode: string; created_at: string }
  const profs = (rawProfs ?? []) as unknown as ProfRow[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Profissionais</h1>
        <p className="text-sm text-gray-500">{profs.length} cadastradas</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>{['Nome','Telefone','Especialidade','Modo','WhatsApp','Default','Cadastro'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {profs.map(p => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/professionals/${p.id}`} className="font-medium text-rose-600 hover:underline">{p.name}</Link>
                </td>
                <td className="px-4 py-3 text-gray-500">{p.phone_number}</td>
                <td className="px-4 py-3 text-gray-500">{p.specialty}</td>
                <td className="px-4 py-3 text-gray-500">{p.service_mode}</td>
                <td className="px-4 py-3">{STATUS_BADGE[p.whatsapp_status] ?? '⚪'} {p.whatsapp_status}</td>
                <td className="px-4 py-3 text-gray-500">{p.default_lara_mode}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
