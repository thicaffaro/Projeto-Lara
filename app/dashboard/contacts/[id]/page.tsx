'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useParams }  from 'next/navigation'
import { ConfirmDialog }          from '@/components/ui/ConfirmDialog'
import { LaraModeSwitcher }       from '@/components/dashboard/conversations/LaraModeSwitcher'
import { useToast }               from '@/components/ui/Toast'
import { formatTime }             from '@/lib/timezone'

interface Contact {
  id: string; name: string | null; phone_number: string
  contact_type: string; lara_mode: 'full'|'booking_only'|'silent'
  is_blocked: boolean; is_vip: boolean; notes: string | null
  address: Record<string, string> | null
}

interface Appointment {
  id: string; protocol_name: string; starts_at: string; status: string
}

type Tab = 'history' | 'conversation' | 'notes' | 'address'

const TYPE_OPTIONS = [
  { value: 'client', label: '👤 Cliente' },
  { value: 'personal', label: '🏠 Pessoal' },
  { value: 'business', label: '📦 Fornecedor' },
  { value: 'unknown', label: '❓ Desconhecido' },
]

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmado', cancelled: 'Cancelado', no_show: 'No-show', pending: 'Pendente',
}

function ContactDetailContent() {
  const router   = useRouter()
  const params   = useParams()
  const id       = params.id as string
  const { toast } = useToast()

  const [contact,      setContact]     = useState<Contact | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tab,          setTab]         = useState<Tab>('history')
  const [notes,        setNotes]       = useState('')
  const [lara,         setLara]        = useState<'full'|'booking_only'|'silent'>('silent')
  const [showMode,     setShowMode]    = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [confirmDel,   setConfirmDel]  = useState(false)
  const [loading,      setLoading]     = useState(true)

  const fetchContact = useCallback(async () => {
    const res = await fetch(`/api/dashboard/contacts/${id}`)
    if (!res.ok) { router.replace('/dashboard/contacts'); return }
    const d = await res.json() as { contact: Contact; appointments: Appointment[] }
    setContact(d.contact)
    setAppointments(d.appointments)
    setNotes(d.contact.notes ?? '')
    setLara(d.contact.lara_mode)
    setLoading(false)
  }, [id, router])

  useEffect(() => { fetchContact() }, [fetchContact])

  // Auto-save notes debounced
  useEffect(() => {
    if (!contact || notes === contact.notes) return
    const t = setTimeout(() => {
      fetch(`/api/dashboard/contacts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
    }, 1000)
    return () => clearTimeout(t)
  }, [notes, id, contact])

  async function patch(data: Record<string, unknown>) {
    await fetch(`/api/dashboard/contacts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await fetchContact()
  }

  if (loading || !contact) return <div className="flex h-full items-center justify-center"><p className="text-sm text-gray-400 animate-pulse">Carregando…</p></div>

  const displayName = contact.name || contact.phone_number

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-xl text-gray-500">←</button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-600">
            {displayName[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">{displayName}</p>
            <p className="text-xs text-gray-400">{contact.phone_number}</p>
          </div>
          <button onClick={() => setShowMode(true)} className="text-xl">{{'full':'🟢','booking_only':'🟡','silent':'🔴'}[lara]}</button>
        </div>

        {/* Actions row */}
        <div className="mt-3 flex gap-2">
          <button onClick={() => patch({ is_vip: !contact.is_vip })}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium border ${contact.is_vip ? 'border-yellow-300 bg-yellow-50 text-yellow-700' : 'border-gray-200 text-gray-500'}`}>
            {contact.is_vip ? '⭐ VIP' : 'Marcar VIP'}
          </button>
          <select value={contact.contact_type}
            onChange={e => patch({ contact_type: e.target.value })}
            className="flex-1 rounded-xl border border-gray-200 px-2 py-1.5 text-xs">
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => setConfirmBlock(true)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium border ${contact.is_blocked ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}>
            {contact.is_blocked ? '🔒 Bloqueado' : 'Bloquear'}
          </button>
        </div>
      </div>

      {/* Tabs internas */}
      <div className="flex border-b border-gray-100 bg-white">
        {([['history','Histórico'],['conversation','Conversa'],['notes','Anotações'],['address','Endereço']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold transition border-b-2 ${tab === t ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {tab === 'history' && (
          <div className="space-y-2">
            {appointments.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nenhuma sessão ainda.</p>}
            {appointments.map(a => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.protocol_name}</p>
                  <p className="text-xs text-gray-400">{formatTime(a.starts_at, 'America/Sao_Paulo')}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  a.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                  a.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                }`}>{STATUS_LABEL[a.status] ?? a.status}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'conversation' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-gray-500">Abra a conversa com esse contato na aba Conversas.</p>
            <a href={`/dashboard/conversations/${id}`}
              className="h-12 px-6 flex items-center justify-center rounded-2xl bg-rose-500 text-sm font-semibold text-white">
              Abrir conversa
            </a>
          </div>
        )}

        {tab === 'notes' && (
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Anotações sobre esse contato... (salva automaticamente)"
            className="h-48 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm focus:border-rose-300 focus:outline-none"
          />
        )}

        {tab === 'address' && (
          <div className="space-y-3">
            {['street','number','neighborhood','city','zip_code'].map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-500 capitalize">{field.replace('_', ' ')}</label>
                <input type="text"
                  defaultValue={contact.address?.[field] ?? ''}
                  onBlur={e => {
                    const addr = { ...(contact.address ?? {}), [field]: e.target.value }
                    patch({ address: addr })
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zona de perigo */}
      <div className="border-t border-gray-100 px-4 py-3">
        <button onClick={() => setConfirmDel(true)} className="text-xs text-red-400">Excluir contato</button>
      </div>

      <LaraModeSwitcher contactId={id} currentMode={lara} isOpen={showMode}
        onClose={() => setShowMode(false)} onUpdated={m => setLara(m)} />

      <ConfirmDialog isOpen={confirmBlock} onClose={() => setConfirmBlock(false)}
        onConfirm={() => { patch({ is_blocked: !contact.is_blocked }); setConfirmBlock(false) }}
        title={contact.is_blocked ? 'Desbloquear contato?' : 'Bloquear contato?'}
        description={contact.is_blocked ? 'A Lara voltará ao comportamento normal.' : 'A Lara vai ignorar todas as mensagens desse contato.'}
        confirmLabel={contact.is_blocked ? 'Desbloquear' : 'Bloquear'} />

      <ConfirmDialog isOpen={confirmDel} onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          await fetch(`/api/dashboard/contacts/${id}`, { method: 'DELETE' }).catch(() => {})
          router.replace('/dashboard/contacts')
        }}
        title="Excluir contato?" description="Isso não pode ser desfeito."
        confirmLabel="Excluir" variant="danger" />
    </div>
  )
}

export default function ContactDetailPage() {
  return <Suspense><ContactDetailContent /></Suspense>
}
