'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BottomSheet }   from '@/components/ui/BottomSheet'
import { useToast }      from '@/components/ui/Toast'
import { maskPhone }     from '@/lib/validation'
import { strings }       from '@/lib/strings'

const s = strings.dashboard.contacts

interface Contact {
  id: string; name: string | null; phone_number: string; contact_type: string
  lara_mode: string; is_blocked: boolean; is_vip: boolean; last_message_at: string | null
}

const TYPE_ICON: Record<string, string> = {
  client: '👤', personal: '🏠', business: '📦', unknown: '❓',
}
const MODE_ICON: Record<string, string> = {
  full: '🟢', booking_only: '🟡', silent: '🔴',
}

function Avatar({ name }: { name: string | null }) {
  const initials = name?.trim().split(' ').slice(0,2).map(w => w[0]?.toUpperCase()).join('') ?? '?'
  const hue = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{ backgroundColor: `hsl(${hue},50%,65%)` }} aria-hidden="true">
      {initials}
    </div>
  )
}

const FILTER_TABS = [
  { id: 'all', label: s.all },
  { id: 'client', label: s.clients },
  { id: 'personal', label: s.personal },
  { id: 'business', label: s.suppliers },
  { id: 'unknown', label: s.unknown },
  { id: 'blocked', label: s.blocked },
] as const

type FilterType = typeof FILTER_TABS[number]['id']

export function ContactList() {
  const [filter,   setFilter]   = useState<FilterType>('all')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search,   setSearch]   = useState('')
  const [debSearch, setDebSearch] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const { toast } = useToast()

  useEffect(() => { const t = setTimeout(() => setDebSearch(search), 300); return () => clearTimeout(t) }, [search])

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/contacts?type=${filter}`)
      if (res.ok) {
        const d = await res.json() as { contacts: Contact[] }
        setContacts(d.contacts ?? [])
      }
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const displayed = debSearch
    ? contacts.filter(c =>
        c.name?.toLowerCase().includes(debSearch.toLowerCase()) ||
        c.phone_number.includes(debSearch.replace(/\D/g, ''))
      )
    : contacts

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="border-b border-gray-100 bg-white px-4 py-2">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou número"
          className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none" />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto border-b border-gray-100 bg-white px-4 py-2 scrollbar-none">
        {FILTER_TABS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.id ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && <p className="py-10 text-center text-sm text-gray-400 animate-pulse">Carregando…</p>}
        {!loading && displayed.length === 0 && (
          <p className="py-16 text-center text-sm text-gray-400">Nenhum contato aqui.</p>
        )}
        {!loading && displayed.map(c => (
          <Link key={c.id} href={`/dashboard/contacts/${c.id}`}
            className="flex min-h-[64px] items-center gap-3 border-b border-gray-50 bg-white px-4 py-3 active:bg-gray-50">
            <Avatar name={c.name} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {c.name || maskPhone(c.phone_number)}
                {c.is_vip && ' ⭐'}
              </p>
              <p className="text-xs text-gray-400">{c.phone_number}</p>
            </div>
            <div className="shrink-0 flex gap-1 text-base">
              <span>{TYPE_ICON[c.contact_type] ?? '❓'}</span>
              <span>{MODE_ICON[c.lara_mode] ?? ''}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* FAB */}
      <button onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-2xl text-white shadow-lg"
        aria-label={s.addContact}>+</button>

      <AddContactSheet isOpen={showAdd} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); fetchContacts() }} toast={toast} />
    </div>
  )
}

function AddContactSheet({ isOpen, onClose, onAdded, toast }: { isOpen: boolean; onClose: () => void; onAdded: () => void; toast: (m: string, t?: 'success'|'error'|'info') => void }) {
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [cType,   setCType]   = useState('unknown')
  const [mode,    setMode]    = useState('silent')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string>()

  async function handleAdd() {
    if (!phone.trim()) { setError('Telefone obrigatório'); return }
    setLoading(true); setError(undefined)
    try {
      const res = await fetch('/api/dashboard/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, phone_number: phone, contact_type: cType, lara_mode: mode }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Erro ao adicionar'); return }
      toast('Contato adicionado!', 'success')
      setName(''); setPhone(''); setCType('unknown'); setMode('silent')
      onAdded()
    } finally { setLoading(false) }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={strings.dashboard.contacts.addContact}>
      <div className="space-y-3 pb-4">
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome (opcional)"
          className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
        <input type="tel" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" maxLength={15}
          className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
        <select value={cType} onChange={e => setCType(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none">
          <option value="unknown">❓ Desconhecido</option>
          <option value="client">👤 Cliente</option>
          <option value="personal">🏠 Pessoal</option>
          <option value="business">📦 Fornecedor</option>
        </select>
        <select value={mode} onChange={e => setMode(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none">
          <option value="silent">🔴 Silêncio</option>
          <option value="booking_only">🟡 Agendamento</option>
          <option value="full">🟢 Completo</option>
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={handleAdd} disabled={loading || !phone.trim()}
          className="h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? 'Adicionando…' : 'Adicionar'}
        </button>
      </div>
    </BottomSheet>
  )
}
