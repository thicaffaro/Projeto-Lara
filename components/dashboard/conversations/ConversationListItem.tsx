'use client'

import Link from 'next/link'

interface ConversationItem {
  id: string
  name: string | null
  phone_number: string
  contact_type: string
  lara_mode: string
  last_message: string | null
  last_message_at: string
  direction?: string | null
  sent_by?: string | null
  unread?: boolean
  is_vip?: boolean
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2)  return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'ontem'
  if (days < 7)  {
    const names = ['dom','seg','ter','qua','qui','sex','sáb']
    return names[new Date(iso).getDay()]
  }
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function Avatar({ name, size = 40 }: { name: string | null; size?: number }) {
  const initials = name
    ? name.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
    : '?'

  // Deterministic color from name hash
  const hue = (name ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  const bg  = `hsl(${hue}, 50%, 70%)`

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-white font-semibold"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.35 }}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

const CONTACT_TYPE_BADGE: Record<string, string> = {
  client:   '👤',
  personal: '🏠',
  business: '📦',
  unknown:  '❓',
}

const LARA_STATUS_BADGE: Record<string, string> = {
  full:         '🤖',
  booking_only: '🟡',
  silent:       '🔴',
}

export function ConversationListItem({ item }: { item: ConversationItem }) {
  const displayName = item.name?.trim() || item.phone_number.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  const preview     = item.last_message ?? '...'
  const timeLabel   = formatRelativeTime(item.last_message_at)
  const isLaraReply = item.direction === 'outbound' && item.sent_by === 'lara'

  return (
    <Link
      href={`/dashboard/conversations/${item.id}`}
      className="flex min-h-[72px] items-center gap-3 border-b border-gray-50 bg-white px-4 py-3 active:bg-gray-50"
    >
      {/* Avatar */}
      <div className="relative">
        <Avatar name={item.name} />
        {item.unread && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-blue-500 border-2 border-white" aria-label="Não lida" />
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm font-semibold truncate text-gray-900 ${item.is_vip ? 'text-rose-600' : ''}`}>
            {displayName}
            {item.is_vip && ' ⭐'}
          </span>
          <span className="shrink-0 text-[10px] text-gray-400">{timeLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isLaraReply && <span className="text-[10px] text-gray-400">🤖</span>}
          <p className="text-xs text-gray-500 truncate flex-1">{preview}</p>
        </div>
      </div>

      {/* Badges */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-base" aria-hidden="true">{CONTACT_TYPE_BADGE[item.contact_type] ?? '❓'}</span>
        <span className="text-xs" aria-hidden="true">{LARA_STATUS_BADGE[item.lara_mode] ?? ''}</span>
      </div>
    </Link>
  )
}
