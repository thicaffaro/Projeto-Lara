'use client'

export const dynamic = 'force-dynamic'

/**
 * /app/dashboard/lara/page.tsx
 * Aba Lara — configurações completas da assistente.
 *
 * Seções (todas colapsáveis):
 *  1. Identidade (nome, tom, emojis)
 *  2. Modo de atendimento (ServiceModeForm)
 *  3. Áreas de atendimento — apenas se service_mode='home' (ServiceAreasForm)
 *  4. Protocolos (ProtocolsForm)
 *  5. Horários de trabalho (WorkingHoursForm)
 *  6. Modos da Lara (default_lara_mode — central)
 *  7. Pausar Lara + horários de silêncio + contatos pessoais
 *  8. Conta e assinatura
 *  9. Conexão WhatsApp
 * 10. Mensagens proativas
 */

import { useState, useEffect, useCallback }    from 'react'
import { useToast }                             from '@/components/ui/Toast'
import { BottomSheet }                          from '@/components/ui/BottomSheet'
import { strings }                              from '@/lib/strings'
import { maskPhone }                            from '@/lib/validation'
import { ServiceModeForm }                      from '@/components/forms/ServiceModeForm'
import { ServiceAreasForm }                     from '@/components/forms/ServiceAreasForm'
import { ProtocolsForm }                        from '@/components/forms/ProtocolsForm'
import { WorkingHoursForm }                     from '@/components/forms/WorkingHoursForm'
import type { StudioAddress, WorkingHours, ServiceAreas, ProfessionalProtocol } from '@/lib/onboarding-types'

const s = strings.dashboard.lara

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfSettings {
  id: string; name: string; phone_number: string
  lara_settings: { name: string; tone: string; emojis: boolean } | null
  is_paused: boolean; silent_hours: { start: string; end: string } | null
  default_lara_mode: string
  whatsapp_status: string; whatsapp_status_changed_at: string | null
  meta_phone_number_id: string | null
  trial_ends_at: string | null; billing_paused_at: string | null
  service_mode: string
  studio_address: StudioAddress | null
  home_service_radius_km: number | null; home_service_buffer_min: number
  service_areas: ServiceAreas | null
  working_hours: WorkingHours | null
  protocols: ProfessionalProtocol[] | null
  recovery_email: string | null; onboarding_completed: boolean
}

interface PersonalContact { id: string; name: string | null; phone_number: string; lara_mode: string }
interface ProactiveRule   { id: string; name: string; enabled: boolean; applicable_service_modes: string[] }
interface LaraStats       { laraReplied: number; silentCount: number; contactsByMode: Record<string, number> }

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false, badge }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100">
      <button onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-4 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          {title}
          {badge && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600">{badge}</span>}
        </span>
        <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-5">{children}</div>}
    </div>
  )
}

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-gray-700">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-rose-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LaraPage() {
  const [prof,      setProf]     = useState<ProfSettings | null>(null)
  const [personal,  setPersonal] = useState<PersonalContact[]>([])
  const [rules,     setRules]    = useState<ProactiveRule[]>([])
  const [stats,     setStats]    = useState<LaraStats | null>(null)
  const [loading,   setLoading]  = useState(true)
  const [showAddPC, setShowAddPC] = useState(false)
  const { toast } = useToast()

  const fetchAll = useCallback(async () => {
    const [sRes, stRes] = await Promise.all([
      fetch('/api/dashboard/lara/settings'),
      fetch('/api/dashboard/lara/stats'),
    ])
    if (sRes.ok) {
      const d = await sRes.json() as {
        professional: ProfSettings
        personalContacts: PersonalContact[]
        proactiveRules:   ProactiveRule[]
      }
      setProf(d.professional)
      setPersonal(d.personalContacts ?? [])
      setRules(d.proactiveRules ?? [])
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
    else {
      const j = await res.json() as { error?: string }
      toast(j.error ?? 'Erro ao salvar', 'error')
    }
  }

  async function toggleRule(ruleId: string, current: boolean) {
    // Proactive rules are global — admin-controlled in MVP.
    // The UI shows them read-only with a note.
    toast('Regras proativas são configuradas pelo suporte no MVP.', 'info')
  }

  if (loading || !prof) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400 animate-pulse">Carregando…</p>
      </div>
    )
  }

  const ls = prof.lara_settings ?? { name: 'Lara', tone: 'warm', emojis: true }

  return (
    <div className="overflow-y-auto overscroll-contain pb-24">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-bold text-gray-900">{s.title}</h1>
      </div>

      {/* ── Seção 1: Identidade ────────────────────────────────────────────── */}
      <Section title={s.identity} defaultOpen>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Nome da assistente</label>
            <input type="text" defaultValue={ls.name}
              onBlur={e => patch({ lara_settings: { ...ls, name: e.target.value } })}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Tom</label>
            <select value={ls.tone}
              onChange={e => patch({ lara_settings: { ...ls, tone: e.target.value } })}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm">
              <option value="warm">🌸 Afetuoso</option>
              <option value="professional">💼 Profissional</option>
            </select>
          </div>
          <Toggle checked={ls.emojis}
            onChange={v => patch({ lara_settings: { ...ls, emojis: v } })}
            label="Usar emojis nas respostas 😊" />
        </div>
      </Section>

      {/* ── Seção 2: Modo de atendimento ──────────────────────────────────── */}
      <Section title={s.serviceMode}>
        <ServiceModeForm
          initial={{
            serviceMode:          prof.service_mode as 'studio' | 'home',
            studioAddress:        prof.studio_address,
            homeRadiusKm:         prof.home_service_radius_km ?? 15,
            homeBufferMin:        prof.home_service_buffer_min ?? 30,
          }}
          onSave={data => {
            const update: Record<string, unknown> = { service_mode: data.serviceMode }
            if (data.studioAddress)  update.studio_address            = data.studioAddress
            if (data.homeRadiusKm)   update.home_service_radius_km    = data.homeRadiusKm
            if (data.homeBufferMin)  update.home_service_buffer_min   = data.homeBufferMin
            patch(update)
          }}
        />
      </Section>

      {/* ── Seção 3: Áreas de atendimento (apenas home) ───────────────────── */}
      {prof.service_mode === 'home' && (
        <Section title={s.serviceAreas}>
          <ServiceAreasForm
            initial={{
              enabled: !!prof.service_areas,
              areas:   (prof.service_areas ?? {}) as ServiceAreas,
            }}
            workingHours={(prof.working_hours ?? {}) as Record<string, unknown>}
            onSave={data => patch({ service_areas: data.enabled ? data.areas : null })}
            onSkip={() => {/* no-op no dashboard */}}
          />
        </Section>
      )}

      {/* ── Seção 4: Protocolos ───────────────────────────────────────────── */}
      <Section title={s.protocols}>
        <ProtocolsForm
          initial={(prof.protocols ?? []) as ProfessionalProtocol[]}
          onSave={protocols => patch({ protocols })}
        />
      </Section>

      {/* ── Seção 5: Horários de trabalho ─────────────────────────────────── */}
      <Section title={s.workingHours}>
        <WorkingHoursForm
          initial={(prof.working_hours ?? {}) as WorkingHours}
          onSave={hours => patch({ working_hours: hours })}
        />
      </Section>

      {/* ── Seção 6: Modos da Lara (central) ──────────────────────────────── */}
      <Section title={s.modes} defaultOpen>
        <p className="mb-3 text-xs text-gray-500">{s.defaultMode}</p>
        {[
          { id: 'cautious', icon: '🛡️', label: s.cautious,  desc: s.cautiousDesc },
          { id: 'standard', icon: '⚡', label: s.standard,  desc: s.standardDesc },
        ].map(opt => (
          <button key={opt.id} onClick={() => patch({ default_lara_mode: opt.id })}
            className={`mb-2 flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
              prof.default_lara_mode === opt.id
                ? 'border-rose-500 bg-rose-50'
                : 'border-gray-100 bg-white'
            }`}>
            <span className="text-xl">{opt.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.desc}</p>
            </div>
          </button>
        ))}
      </Section>

      {/* ── Seção 7a: Pausar Lara + silêncio ──────────────────────────────── */}
      <Section title={s.pause}>
        <div className="space-y-4">
          {prof.is_paused && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">⏸️ {s.pausedBanner}</div>
          )}
          <Toggle checked={prof.is_paused}
            onChange={v => patch({ is_paused: v })}
            label={prof.is_paused ? 'Reativar Lara' : 'Pausar Lara'} />
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

      {/* ── Seção 7b: Contatos pessoais ───────────────────────────────────── */}
      <Section title={s.personalContacts} badge={personal.length > 0 ? String(personal.length) : undefined}>
        <div className="space-y-2">
          {personal.length === 0 && (
            <p className="text-xs text-gray-400">Nenhum contato pessoal cadastrado. A Lara ficará em silêncio automaticamente com quem você adicionar aqui.</p>
          )}
          {personal.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.name || c.phone_number}</p>
                <p className="text-xs text-gray-400">{c.phone_number}</p>
              </div>
              <span className="text-base">🔴</span>
            </div>
          ))}
          <button onClick={() => setShowAddPC(true)}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">
            + {strings.dashboard.contacts.addPersonal}
          </button>
        </div>
      </Section>

      {/* ── Seção: Estatísticas ───────────────────────────────────────────── */}
      {stats && (
        <Section title={s.stats}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Respondidas pela Lara',  value: stats.laraReplied },
              { label: 'Ficaram pra você',        value: stats.silentCount },
              { label: 'Em modo completo',        value: stats.contactsByMode.full ?? 0 },
            ].map(card => (
              <div key={card.label} className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
                <p className="mt-0.5 text-[10px] text-gray-500 leading-tight">{card.label}</p>
              </div>
            ))}
          </div>
          {Object.keys(stats.contactsByMode).length > 0 && (
            <div className="mt-3 space-y-1">
              {Object.entries(stats.contactsByMode).map(([mode, count]) => (
                <div key={mode} className="flex items-center gap-3">
                  <span>{{'full':'🟢','booking_only':'🟡','silent':'🔴'}[mode] ?? '⚪'}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-rose-400 rounded-full"
                      style={{ width: `${Math.min(100, (count / (Object.values(stats.contactsByMode).reduce((a,b) => a+b, 0) || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Seção 9: Conexão WhatsApp ─────────────────────────────────────── */}
      <Section title={s.connection}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">
              {prof.whatsapp_status === 'connected'     ? '🟢' :
               prof.whatsapp_status === 'token_invalid' ? '🟡' : '🔴'}
            </span>
            <span className="text-sm text-gray-700">
              {prof.whatsapp_status === 'connected'     ? 'Conectado' :
               prof.whatsapp_status === 'token_invalid' ? 'Token inválido — reconexão necessária' :
               'Desconectado'}
            </span>
          </div>
          {prof.meta_phone_number_id && (
            <p className="text-xs text-gray-400">ID: {prof.meta_phone_number_id}</p>
          )}
          {(prof.whatsapp_status === 'token_invalid' || prof.whatsapp_status === 'disconnected') && (
            <a href="/onboarding/setup" className="inline-flex h-10 items-center rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white">
              {s.reconnect}
            </a>
          )}
        </div>
      </Section>

      {/* ── Seção 8: Conta e assinatura ───────────────────────────────────── */}
      <Section title={s.account}>
        <div className="space-y-3">
          {prof.trial_ends_at && new Date(prof.trial_ends_at) > new Date() && (
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
              🕐 Trial até {new Date(prof.trial_ends_at).toLocaleDateString('pt-BR')}
            </div>
          )}
          {!prof.trial_ends_at && !prof.billing_paused_at && (
            <p className="text-sm text-green-700">✅ Assinatura ativa — R$ 99/mês</p>
          )}
          {prof.billing_paused_at && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              ⚠️ Cobrança pausada desde {new Date(prof.billing_paused_at).toLocaleDateString('pt-BR')}
            </div>
          )}
          <a href="/dashboard/account/export" className="block text-sm text-rose-500 underline-offset-2 hover:underline">{s.exportData}</a>
          <a href="/dashboard/account/cancel" className="block text-sm text-gray-400">{s.cancel}</a>
        </div>
      </Section>

      {/* ── Seção 10: Mensagens proativas ─────────────────────────────────── */}
      <Section title={s.proactive}>
        {rules.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma regra proativa configurada ainda.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">As regras proativas são enviadas automaticamente pela Lara conforme o contexto.</p>
            {rules.map(rule => {
              const applicable = rule.applicable_service_modes.includes(prof.service_mode)
              return (
                <div key={rule.id} className={`flex items-center justify-between rounded-xl border p-3 ${!applicable ? 'opacity-40' : ''}`}>
                  <div>
                    <p className="text-xs font-medium text-gray-900">{rule.name.replace(/_/g, ' ')}</p>
                    {!applicable && <p className="text-[10px] text-gray-400">Não aplicável ao seu modo de atendimento</p>}
                  </div>
                  <button onClick={() => toggleRule(rule.id, rule.enabled)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${rule.enabled && applicable ? 'bg-rose-400' : 'bg-gray-200'}`}
                    disabled={!applicable}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${rule.enabled && applicable ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── AddPersonalContact BottomSheet ────────────────────────────────── */}
      <AddPersonalContactSheet
        isOpen={showAddPC}
        onClose={() => setShowAddPC(false)}
        onAdded={() => { setShowAddPC(false); fetchAll() }}
        toast={toast}
      />
    </div>
  )
}

// ── Add personal contact sheet ────────────────────────────────────────────────

function AddPersonalContactSheet({
  isOpen, onClose, onAdded, toast,
}: {
  isOpen: boolean; onClose: () => void; onAdded: () => void
  toast: (m: string, t?: 'success' | 'error' | 'info') => void
}) {
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string>()

  async function handleAdd() {
    if (!phone.trim()) { setError('Telefone obrigatório'); return }
    setLoading(true); setError(undefined)
    try {
      const res = await fetch('/api/dashboard/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          phone_number: phone,
          contact_type: 'personal',
          lara_mode: 'silent',
        }),
      })
      const j = await res.json() as { error?: string }
      if (!res.ok) { setError(j.error ?? 'Erro ao adicionar'); return }
      toast('Contato pessoal adicionado!', 'success')
      setName(''); setPhone('')
      onAdded()
    } finally { setLoading(false) }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={strings.dashboard.contacts.addPersonal}>
      <div className="space-y-3 pb-4">
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome (opcional)"
          className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
        <input type="tel" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" maxLength={15}
          className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
        <p className="text-xs text-gray-400">🔴 A Lara ficará em silêncio para esse contato automaticamente.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={handleAdd} disabled={loading || !phone.trim()}
          className="h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? 'Adicionando…' : 'Adicionar'}
        </button>
      </div>
    </BottomSheet>
  )
}
