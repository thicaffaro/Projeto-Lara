'use client'

import { formatTz } from '@/lib/timezone'

interface Message {
  id: string
  content: string | null        // campo real na tabela = 'content'
  direction: 'inbound' | 'outbound'
  sent_by?: 'lara' | 'professional' | null
  created_at: string
  lara_mode_decision?: string | null
}

interface Props {
  message: Message
  showTimestamp: boolean
  timezone: string
}

export function ChatBubble({ message, showTimestamp, timezone }: Props) {
  const isInbound     = message.direction === 'inbound'
  const isLara        = !isInbound && message.sent_by === 'lara'
  const isProfessional = !isInbound && message.sent_by === 'professional'

  const timeLabel = formatTz(message.created_at, 'HH:mm', timezone)

  if (!message.content) return null

  return (
    <div className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'} mb-1`}>
      {/* Separador de dia (renderizado externamente, placeholder aqui) */}

      {/* Bolha */}
      <div
        className={`max-w-[80%] px-3 py-2 text-[15px] leading-[1.4] ${
          isInbound
            ? 'rounded-2xl rounded-bl-sm bg-gray-100 text-gray-900'
            : 'rounded-2xl rounded-br-sm bg-green-500 text-white'
        }`}
        style={{ wordBreak: 'break-word' }}
      >
        {message.content}
      </div>

      {/* Etiqueta Lara + timestamp */}
      <div className={`mt-0.5 flex items-center gap-1 ${isInbound ? '' : 'flex-row-reverse'}`}>
        {isLara && (
          <span className="text-[10px] text-gray-400">🤖 Lara</span>
        )}
        {showTimestamp && (
          <span className="text-[10px] text-gray-400">{timeLabel}</span>
        )}
      </div>
    </div>
  )
}

// Separador de dia entre grupos de mensagens
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] font-medium text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

/**
 * Dado um array de mensagens ordenadas ASC, retorna os pontos onde
 * deve aparecer separador de dia e quais timestamps mostrar.
 */
export function groupMessagesWithSeparators(
  messages: Message[],
  timezone: string,
): Array<{ type: 'separator'; label: string } | { type: 'message'; message: Message; showTimestamp: boolean }> {
  const result: ReturnType<typeof groupMessagesWithSeparators> = []
  let lastDayStr = ''
  let lastMsgTime = 0

  for (const msg of messages) {
    const dayStr = formatTz(msg.created_at, 'yyyy-MM-dd', timezone)
    const msgTime = new Date(msg.created_at).getTime()

    // Separador de dia
    if (dayStr !== lastDayStr) {
      const today     = formatTz(new Date(), 'yyyy-MM-dd', timezone)
      const yesterday = formatTz(new Date(Date.now() - 86_400_000), 'yyyy-MM-dd', timezone)
      const label = dayStr === today ? 'Hoje'
                  : dayStr === yesterday ? 'Ontem'
                  : formatTz(msg.created_at, "d 'de' MMMM", timezone)
      result.push({ type: 'separator', label })
      lastDayStr = dayStr
      lastMsgTime = 0 // força timestamp após separador
    }

    // Mostra timestamp se > 5min desde última mensagem
    const showTimestamp = msgTime - lastMsgTime > 5 * 60_000
    result.push({ type: 'message', message: msg, showTimestamp })
    lastMsgTime = msgTime
  }

  return result
}
