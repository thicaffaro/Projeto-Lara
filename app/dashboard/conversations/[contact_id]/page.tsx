'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useParams }                                 from 'next/navigation'
import { ChatBubble, DaySeparator, groupMessagesWithSeparators } from '@/components/dashboard/conversations/ChatBubble'
import { ChatInput }         from '@/components/dashboard/conversations/ChatInput'
import { LaraModeSwitcher }  from '@/components/dashboard/conversations/LaraModeSwitcher'
import { strings }           from '@/lib/strings'

const s = strings.dashboard.conversations

interface Message {
  id: string; content: string | null; direction: 'inbound' | 'outbound'
  sent_by?: 'lara' | 'professional' | null; created_at: string; lara_mode_decision?: string | null
  // Campos de mídia (Prompt C2)
  message_type:  string         // default 'text' para mensagens antigas
  media_url?:    string | null
  media_caption?: string | null
  media_type?:   string | null
}

interface ContactData {
  id: string; name: string | null; phone_number: string
  contact_type: string; lara_mode: 'full' | 'booking_only' | 'silent'
  notes: string | null; is_vip: boolean
}

interface ConversationData {
  contact: ContactData; messages: Message[]
  has_active_handover: boolean; handover_id: string | null
  is_within_meta_window: boolean; has_more: boolean
  professionalId?: string; timezone?: string
}

function formatPhone(phone: string) {
  return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

function ConversationContent() {
  const router     = useRouter()
  const params     = useParams()
  const contactId  = params.contact_id as string

  const [data,       setData]       = useState<ConversationData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [offset,     setOffset]     = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [laraMode,   setLaraMode]   = useState<'full'|'booking_only'|'silent'>('silent')
  const [hasHandover, setHasHandover] = useState(false)
  const [withinWindow, setWithinWindow] = useState(false)
  const [showModeSheet, setShowModeSheet] = useState(false)

  const bodyRef     = useRef<HTMLDivElement>(null)
  const lastMsgRef  = useRef<string>('')
  const isVisible   = useRef(true)

  // Fetch inicial
  useEffect(() => {
    fetch(`/api/dashboard/conversations/${contactId}`)
      .then(r => r.json())
      .then((d: ConversationData) => {
        setData(d)
        setLaraMode(d.contact.lara_mode)
        setHasHandover(d.has_active_handover)
        setWithinWindow(d.is_within_meta_window)
        if (d.messages.length > 0) {
          lastMsgRef.current = d.messages[d.messages.length - 1].created_at
        }
      })
      .finally(() => {
        setLoading(false)
        // Scroll para o final após render
        setTimeout(() => {
          if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
        }, 50)
      })

    // Marca como lida
    fetch(`/api/dashboard/conversations/${contactId}/read`, { method: 'POST' })
  }, [contactId])

  // Polling de novas mensagens
  const pollMessages = useCallback(async () => {
    if (!lastMsgRef.current) return
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
    try {
      const res = await fetch(
        `/api/dashboard/conversations/${contactId}?after=${encodeURIComponent(lastMsgRef.current)}&from=${encodeURIComponent(thirtyDaysAgo)}`
      )
      if (!res.ok) return
      const d = await res.json() as { messages: Message[]; is_within_meta_window: boolean }
      if (d.messages?.length) {
        setData(prev => prev ? {
          ...prev,
          messages: [...prev.messages, ...d.messages],
          is_within_meta_window: d.is_within_meta_window,
        } : prev)
        lastMsgRef.current = d.messages[d.messages.length - 1].created_at
        setWithinWindow(d.is_within_meta_window)
        // Scroll para o final apenas se já estava no final
        if (bodyRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = bodyRef.current
          if (scrollHeight - scrollTop - clientHeight < 100) {
            bodyRef.current.scrollTop = scrollHeight
          }
        }
      }
    } catch { /* silencioso */ }
  }, [contactId])

  useEffect(() => {
    const handleVis = () => { isVisible.current = !document.hidden }
    document.addEventListener('visibilitychange', handleVis)

    const interval = setInterval(() => {
      pollMessages()
    }, isVisible.current ? 3_000 : 10_000)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVis)
    }
  }, [pollMessages])

  // Carregar mais mensagens antigas (paginação reversa)
  async function handleLoadMore() {
    if (loadingMore || !data?.has_more) return
    setLoadingMore(true)
    const newOffset = offset + 30
    try {
      const res = await fetch(`/api/dashboard/conversations/${contactId}?offset=${newOffset}`)
      if (!res.ok) return
      const d = await res.json() as ConversationData
      setData(prev => prev ? {
        ...prev,
        messages: [...d.messages, ...prev.messages],
        has_more: d.has_more,
      } : prev)
      setOffset(newOffset)
    } finally {
      setLoadingMore(false)
    }
  }

  function handleOptimisticMessage(msg: Message) {
    setData(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : prev)
    lastMsgRef.current = msg.created_at
    setTimeout(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }, 30)
  }

  async function handleTakeOver() {
    await fetch(`/api/dashboard/contacts/${contactId}/handover`, { method: 'POST' })
    setHasHandover(true)
  }

  async function handleReturnToLara() {
    await fetch(`/api/dashboard/contacts/${contactId}/handover`, { method: 'DELETE' })
    setHasHandover(false)
  }

  if (loading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400 animate-pulse">Carregando conversa…</p>
      </div>
    )
  }

  const { contact, messages, timezone = 'America/Sao_Paulo', professionalId = '' } = { ...data, timezone: 'America/Sao_Paulo', professionalId: '' }
  const grouped = groupMessagesWithSeparators(messages, timezone)

  // ── Banner contextual ──────────────────────────────────────────────────────
  function BannerContextual() {
    if (hasHandover) {
      return (
        <div className="flex items-center gap-3 bg-blue-50 px-4 py-2.5 text-sm">
          <span className="flex-1 text-blue-800">🔔 {s.handoverBanner}</span>
          <button onClick={handleReturnToLara} className="shrink-0 rounded-xl border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700">
            {s.returnToLara}
          </button>
        </div>
      )
    }
    if (laraMode === 'silent') {
      return (
        <div className="flex items-center gap-3 bg-red-50 px-4 py-2.5 text-sm">
          <span className="flex-1 text-red-800">🔴 {s.silentBanner}</span>
          <button onClick={() => setShowModeSheet(true)} className="shrink-0 rounded-xl border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700">
            {s.changeMode}
          </button>
        </div>
      )
    }
    if (laraMode === 'booking_only') {
      return (
        <div className="flex items-center gap-3 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="flex-1 text-amber-800">🟡 {s.bookingOnlyBanner}</span>
          <button onClick={() => setShowModeSheet(true)} className="shrink-0 rounded-xl border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700">
            {s.changeMode}
          </button>
        </div>
      )
    }
    // full + sem handover
    return (
      <div className="flex items-center gap-3 bg-gray-50 px-4 py-2.5 text-sm">
        <span className="flex-1 text-gray-600">🤖 {s.fullBanner}</span>
        <button onClick={handleTakeOver} className="shrink-0 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600">
          {s.takeOver}
        </button>
      </div>
    )
  }

  const LARA_MODE_BADGE: Record<string, string> = { full: '🟢', booking_only: '🟡', silent: '🔴' }

  return (
    <div className="flex flex-col h-full">
      {/* Header fixo */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button onClick={() => router.back()} className="shrink-0 text-gray-500 text-xl leading-none" aria-label="Voltar">
          ←
        </button>

        {/* Avatar mini */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600">
          {(contact.name ?? contact.phone_number)[0]?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {contact.name || formatPhone(contact.phone_number)}
          </p>
          <p className="text-xs text-gray-500">{formatPhone(contact.phone_number)}</p>
        </div>

        {/* Badge de modo da Lara */}
        <button
          onClick={() => setShowModeSheet(true)}
          aria-label="Modo da Lara"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50"
        >
          <span className="text-base">{LARA_MODE_BADGE[laraMode] ?? '⚙️'}</span>
        </button>
      </div>

      {/* Banner contextual */}
      <BannerContextual />

      {/* Body — mensagens */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-0.5">
        {/* Botão carregar mais */}
        {data.has_more && (
          <div className="flex justify-center py-2">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-xs text-rose-500 disabled:opacity-50"
            >
              {loadingMore ? 'Carregando…' : s.loadMore}
            </button>
          </div>
        )}

        {grouped.map((item, i) =>
          item.type === 'separator' ? (
            <DaySeparator key={`sep-${i}`} label={item.label} />
          ) : (
            <ChatBubble
              key={item.message.id}
              message={item.message as Parameters<typeof ChatBubble>[0]['message']}
              showTimestamp={item.showTimestamp}
              timezone={timezone}
            />
          )
        )}
      </div>

      {/* Footer — input */}
      <ChatInput
        contactId={contactId}
        professionalId={professionalId}
        contactPhoneNumber={contact.phone_number}
        onMessageSent={handleOptimisticMessage}
        isWithinMetaWindow={withinWindow}
      />

      {/* LaraModeSwitcher */}
      <LaraModeSwitcher
        contactId={contactId}
        currentMode={laraMode}
        isOpen={showModeSheet}
        onClose={() => setShowModeSheet(false)}
        onUpdated={mode => setLaraMode(mode)}
      />
    </div>
  )
}

export default function ConversationPage() {
  return (
    <Suspense>
      <ConversationContent />
    </Suspense>
  )
}
