'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/Toast'
import { strings }  from '@/lib/strings'

const s = strings.dashboard.lara

interface ProfSettings {
  id: string; name: string; lara_settings: { name: string; tone: string; emojis: boolean } | null
  is_paused: boolean; silent_hours: { start: string; end: string } | null
  default_lara_mode: string; whatsapp_status: string; whatsapp_status_changed_at: string | null
  meta_phone_number_id: string | null; trial_ends_at: string | null; billing_paused_at: string | null
  service_mode: string
}

interface LaraStats { laraReplied: number; silentCount: number; contactsByMode: Record<string, number> }

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-4 py-4 text-left">
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export default function LaraPage() {
  const [prof,    setProf]    = useState<ProfSettings | null>(null)
  const [stats,   setStats]   = useState<LaraStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const fetchAll = useCallback(async () => {
    const [sRes, stRes] = await Promise.all([
      fetch('/api/dashboard/lara/settings'),
      fetch('/api/dashboard/lara/stats'),
    ])
    if (sRes.ok) {
      const d = await sRes.json() as { professional: ProfSettings }
      setProf(d.professional)
    }
    if (stRes.ok) setStats(await stRes.json() as LaraStats)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function patch(data: Record<string, unknown>) {
    const res = await fetch('/api/dashboard/lara/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) { toast('Salvo!', 'success'); await fetchAll() }
    else { const j = await res.json() as { error?: string }; toast(j.error ?? 'Erro ao salvar', 'error') }
  }

  if (loading || !prof) return <div className="flex h-full items-center justify-center"><p className="text-sm text-gray-400 animate-pulse">Carregando…</p></div>

  const ls = prof.lara_settings ?? { name: 'Lara', tone: 'warm', emojis: true }

  return (
    <div className="overflow-y-auto overscroll-contain pb-8">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-bold text-gray-900">{s.title}</h1>
      </div>

      {/* Seção 1: Identidade */}
      <Section title={s.identity} defaultOpen>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Nome da assistente</label>
            <input type="text" defaultValue={ls.name} onBlur={e => patch({ lara_settings: { ...ls, name: e.target.value } })}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Tom</label>
            <select value={ls.tone} onChange={e => patch({ lara_settings: { ...ls, tone: e.target.value } })}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm">
              <option value="warm">🌸 Afetuoso</option>
              <option value="professional">💼 Profissional</option>
            </select>
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={ls.emojis} onChange={e => patch({ lara_settings: { ...ls, emojis: e.target.checked } })}
              className="h-4 w-4 accent-rose-500" />
            <span className="text-sm text-gray-700">Usar emojis nas respostas 😊</span>
          </label>
        </div>
      </Section>

      {/* Seção 6: Modos da Lara (central) */}
      <Section title={s.modes} defaultOpen>
        <p className="mb-3 text-xs text-gray-500">{s.defaultMode}</p>
        {[
          { id: 'cautious', icon: '🛡️', label: s.cautious, desc: s.cautiousDesc },
          { id: 'standard', icon: '⚡', label: s.standard, desc: s.standardDesc },
        ].map(opt => (
          <button key={opt.id} onClick={() => patch({ default_lara_mode: opt.id })}
            className={`mb-2 flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left ${
              prof.default_lara_mode === opt.id ? 'border-rose-500 bg-rose-50' : 'border-gray-100'
            }`}>
            <span className="text-xl">{opt.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.desc}</p>
            </div>
          </button>
        ))}
      </Section>

      {/* Seção 7: Pausar Lara */}
      <Section title={s.pause}>
        <div className="space-y-4">
          {prof.is_paused && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">⏸️ {s.pausedBanner}</div>
          )}
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{prof.is_paused ? 'Reativar Lara' : 'Pausar Lara'}</span>
            <button onClick={() => patch({ is_paused: !prof.is_paused })}
              className={`relative h-6 w-11 rounded-full transition-colors ${prof.is_paused ? 'bg-rose-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${prof.is_paused ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">{s.silentHours}</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400">Início</label>
                <input type="time" defaultValue={prof.silent_hours?.start ?? '22:00'}
                  onBlur={e => patch({ silent_hours: { ...(prof.silent_hours ?? { end: '08:00' }), start: e.target.value } })}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-2 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-400">Fim</label>
                <input type="time" defaultValue={prof.silent_hours?.end ?? '08:00'}
                  onBlur={e => patch({ silent_hours: { ...(prof.silent_hours ?? { start: '22:00' }), end: e.target.value } })}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-2 text-sm" />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Seção: Estatísticas */}
      {stats && (
        <Section title={s.stats}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Respondidas pela Lara', value: stats.laraReplied },
              { label: 'Ficaram pra você', value: stats.silentCount },
              { label: 'Contatos full', value: stats.contactsByMode.full ?? 0 },
            ].map(card => (
              <div key={card.label} className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
                <p className="mt-0.5 text-[10px] text-gray-500 leading-tight">{card.label}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Seção 9: Conexão WhatsApp */}
      <Section title={s.connection}>
        <div className="space-y-2">
          <p className="text-sm">
            Status: {prof.whatsapp_status === 'connected' ? '🟢 Conectado' :
                     prof.whatsapp_status === 'token_invalid' ? '🟡 Token inválido' : '🔴 Desconectado'}
          </p>
          {prof.meta_phone_number_id && (
            <p className="text-xs text-gray-400">ID: {prof.meta_phone_number_id}</p>
          )}
          {(prof.whatsapp_status === 'token_invalid' || prof.whatsapp_status === 'disconnected') && (
            <a href="/api/onboarding/reconnect" className="inline-block rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white">
              {s.reconnect}
            </a>
          )}
        </div>
      </Section>

      {/* Seção 8: Conta */}
      <Section title={s.account}>
        <div className="space-y-3">
          {prof.trial_ends_at && new Date(prof.trial_ends_at) > new Date() && (
            <p className="text-sm text-amber-700">Trial até {new Date(prof.trial_ends_at).toLocaleDateString('pt-BR')}</p>
          )}
          {prof.billing_paused_at && (
            <p className="text-sm text-red-600">⚠️ Cobrança pausada desde {new Date(prof.billing_paused_at).toLocaleDateString('pt-BR')}</p>
          )}
          <a href="/dashboard/account/export" className="block text-sm text-rose-500 underline-offset-2 hover:underline">{s.exportData}</a>
          <a href="/dashboard/account/cancel" className="block text-sm text-gray-400">{s.cancel}</a>
        </div>
      </Section>
    </div>
  )
}
