'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { ConversationListItem } from '@/components/dashboard/conversations/ConversationListItem'
import { strings } from '@/lib/strings'

const s = strings.dashboard.conversations

type Tab = 'waiting' | 'lara' | 'recent'

interface ConversationItem {
  id: string; name: string | null; phone_number: string; contact_type: string
  lara_mode: string; last_message: string | null; last_message_at: string
  direction?: string | null; sent_by?: string | null; unread?: boolean; is_vip?: boolean
}

function ConversationsContent() {
  const [tab,     setTab]     = useState<Tab>('waiting')
  const [items,   setItems]   = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/dashboard/conversations?${params}`)
      if (res.ok) {
        const data = await res.json() as { conversations: ConversationItem[] }
        setItems(data.conversations ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [tab, debouncedSearch])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'waiting', label: s.waitingForYou },
    { id: 'lara',    label: s.laraCaring    },
    { id: 'recent',  label: s.recent        },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Sub-abas */}
      <div className="flex border-b border-gray-100 bg-white">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'true' : undefined}
            className={`flex-1 py-3 text-xs font-semibold transition border-b-2 ${
              tab === t.id
                ? 'border-rose-500 text-rose-600'
                : 'border-transparent text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search (só na sub-aba recentes) */}
      {tab === 'recent' && (
        <div className="border-b border-gray-100 bg-white px-4 py-2">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={s.searchPlaceholder}
            className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-rose-300 focus:outline-none"
          />
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400 animate-pulse">Carregando…</p>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-3xl" aria-hidden="true">
              {tab === 'waiting' ? '✅' : tab === 'lara' ? '🤖' : '💬'}
            </p>
            <p className="mt-3 text-sm text-gray-500">{s.noMessages}</p>
          </div>
        )}

        {!loading && items.map(item => (
          <ConversationListItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

export default function ConversationsPage() {
  return (
    <Suspense>
      <ConversationsContent />
    </Suspense>
  )
}
