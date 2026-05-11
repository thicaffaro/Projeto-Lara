'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import Link from 'next/link'

interface ProfDetail {
  id: string; name: string; phone_number: string; specialty: string; service_mode: string
  whatsapp_status: string; default_lara_mode: string; is_paused: boolean
  trial_started_at: string | null; trial_ends_at: string | null
  created_at: string; onboarding_completed: boolean
}

const COLORS = ['#f43f5e','#fb923c','#facc15','#4ade80','#60a5fa','#c084fc']

function AdminProfDetailContent() {
  const params = useParams()
  const id = params.id as string

  const [prof,   setProf]   = useState<ProfDetail | null>(null)
  const [stats,  setStats]  = useState<{ byMode: Array<{name:string;value:number}>; byDecision: Array<{decision:string;count:number}> } | null>(null)
  const [tab,    setTab]    = useState('general')
  const [loading, setLoading] = useState(true)
  const [actionResult, setActionResult] = useState<string>()

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/professionals/${id}`).then(r => r.json()),
      fetch(`/api/admin/professionals/${id}/stats`).then(r => r.json()),
    ]).then(([pd, sd]) => {
      setProf((pd as { professional: ProfDetail }).professional)
      setStats(sd as typeof stats)
    }).finally(() => setLoading(false))
  }, [id])

  async function adminAction(action: string) {
    const res = await fetch(`/api/admin/professionals/${id}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const d = await res.json() as { ok?: boolean; url?: string; error?: string }
    setActionResult(d.ok ? (d.url ? `Link: ${d.url}` : 'Ação executada!') : (d.error ?? 'Erro'))
  }

  if (loading || !prof) return <p className="text-sm text-gray-400 animate-pulse">Carregando…</p>

  const TABS = [['general','Geral'],['lara','Atividade da Lara'],['activity','Atividade'],['financial','Financeiro']]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link href="/admin/professionals" className="text-gray-400 hover:text-gray-600">← Voltar</Link>
        <h1 className="text-xl font-bold text-gray-900">{prof.name}</h1>
        <span className="text-sm text-gray-500">{prof.phone_number}</span>
      </div>

      {actionResult && <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{actionResult}</div>}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Enviar magic link', action: 'send_magic_link' },
          { label: 'Resetar PIN', action: 'reset_pin' },
          { label: prof.is_paused ? 'Reativar' : 'Suspender', action: prof.is_paused ? 'reactivate' : 'suspend' },
        ].map(btn => (
          <button key={btn.action} onClick={() => adminAction(btn.action)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {btn.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === t ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Geral */}
      {tab === 'general' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {[
            { label: 'Especialidade', value: prof.specialty },
            { label: 'Modo', value: prof.service_mode },
            { label: 'WhatsApp', value: prof.whatsapp_status },
            { label: 'Default Lara', value: prof.default_lara_mode },
            { label: 'Onboarding', value: prof.onboarding_completed ? '✅' : '⏳' },
            { label: 'Cadastro', value: new Date(prof.created_at).toLocaleDateString('pt-BR') },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Atividade da Lara */}
      {tab === 'lara' && stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {stats.byMode.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-gray-700">Contatos por modo da Lara</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.byMode} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {stats.byMode.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {stats.byDecision.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-gray-700">Mensagens por decisão da Lara (mês)</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.byDecision} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="decision" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f43f5e" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Tab: Financeiro */}
      {tab === 'financial' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 text-sm">
          {prof.trial_started_at && <p><span className="text-gray-400">Trial iniciado:</span> {new Date(prof.trial_started_at).toLocaleDateString('pt-BR')}</p>}
          {prof.trial_ends_at && <p><span className="text-gray-400">Trial expira:</span> {new Date(prof.trial_ends_at).toLocaleDateString('pt-BR')}</p>}
        </div>
      )}
    </div>
  )
}

export default function AdminProfDetailPage() {
  return <Suspense><AdminProfDetailContent /></Suspense>
}
