'use client'

/**
 * /components/dashboard/conversations/ChatBubble.tsx
 * Renderiza uma mensagem no chat (texto, imagem, áudio, vídeo, documento).
 *
 * Tipos de mídia suportados:
 *   text     → texto simples
 *   image    → <img> clicável para abrir MediaViewer
 *   audio    → player nativo HTML5
 *   video    → <video> clicável para abrir MediaViewer
 *   document → link de download
 *   sticker  → renderizado como imagem simples (sem caption)
 */

import { formatTz } from '@/lib/timezone'

export interface MessageForBubble {
  id:                string
  content:           string | null
  direction:         'inbound' | 'outbound'
  sent_by?:          'lara' | 'professional' | null
  created_at:        string
  lara_mode_decision?: string | null
  // Campos de mídia
  message_type:      string         // 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker'
  media_url?:        string | null
  media_caption?:    string | null
  media_type?:       string | null  // mime-type (ex: 'audio/ogg')
}

interface Props {
  message:       MessageForBubble
  showTimestamp: boolean
  timezone:      string
  onMediaTap?:   (url: string, type: 'image' | 'video') => void
}

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker'])

export function ChatBubble({ message, showTimestamp, timezone, onMediaTap }: Props) {
  const isInbound     = message.direction === 'inbound'
  const isLara        = !isInbound && message.sent_by === 'lara'
  const timeLabel     = formatTz(message.created_at, 'HH:mm', timezone)
  const isMedia       = MEDIA_TYPES.has(message.message_type)
  const hasText       = !!message.content

  // Não renderizar se não tem conteúdo E não é mídia
  if (!hasText && !isMedia) return null

  return (
    <div className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'} mb-1`}>
      {/* Bolha */}
      <div
        className={`max-w-[80%] overflow-hidden text-[15px] leading-[1.4] ${
          isInbound
            ? 'rounded-2xl rounded-bl-sm bg-gray-100 text-gray-900'
            : 'rounded-2xl rounded-br-sm bg-green-500 text-white'
        }`}
        style={{ wordBreak: 'break-word' }}
      >
        {/* Conteúdo por tipo */}
        <MediaContent
          message={message}
          isInbound={isInbound}
          onMediaTap={onMediaTap}
        />

        {/* Texto livre (caption ou mensagem de texto) */}
        {hasText && message.message_type === 'text' && (
          <p className="px-3 py-2">{message.content}</p>
        )}
      </div>

      {/* Etiqueta Lara + timestamp */}
      <div className={`mt-0.5 flex items-center gap-1 ${isInbound ? '' : 'flex-row-reverse'}`}>
        {isLara && <span className="text-[10px] text-gray-400">🤖 Lara</span>}
        {showTimestamp && <span className="text-[10px] text-gray-400">{timeLabel}</span>}
      </div>
    </div>
  )
}

// ── Renderização de mídia ─────────────────────────────────────────────────────

function MediaContent({
  message,
  isInbound,
  onMediaTap,
}: {
  message:       MessageForBubble
  isInbound:     boolean
  onMediaTap?:   (url: string, type: 'image' | 'video') => void
}) {
  const { message_type: type, media_url: url, media_caption: caption, media_type: mimeType } = message

  const unavailableClass = `px-3 py-2 text-sm italic ${isInbound ? 'text-gray-400' : 'text-green-100'}`

  if (type === 'image') {
    if (!url) return <p className={unavailableClass}>📷 Imagem não disponível</p>
    return (
      <div>
        <button
          onClick={() => onMediaTap?.(url, 'image')}
          className="block focus:outline-none"
          aria-label="Ver foto em tela cheia"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={caption ?? 'Foto'}
            className="max-w-[240px] rounded-t-2xl object-cover"
            loading="lazy"
          />
        </button>
        {caption && (
          <p className={`px-3 py-1.5 text-sm ${isInbound ? '' : 'text-white'}`}>{caption}</p>
        )}
      </div>
    )
  }

  if (type === 'sticker') {
    if (!url) return null
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Figurinha"
        className="h-24 w-24 object-contain p-1"
        loading="lazy"
      />
    )
  }

  if (type === 'audio') {
    if (!url) return <p className={unavailableClass}>🎤 Áudio não disponível</p>
    return (
      <div className="px-2 py-2">
        <audio
          controls
          preload="none"
          className="max-w-[240px] min-w-[200px]"
          style={{ height: '36px' }}
        >
          <source src={url} type={mimeType ?? 'audio/ogg'} />
          Seu navegador não suporta áudio.
        </audio>
      </div>
    )
  }

  if (type === 'video') {
    if (!url) return <p className={unavailableClass}>🎬 Vídeo não disponível</p>
    return (
      <div>
        <button
          onClick={() => onMediaTap?.(url, 'video')}
          className="relative block focus:outline-none"
          aria-label="Ver vídeo em tela cheia"
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={url}
            className="max-w-[240px] rounded-t-2xl"
            preload="metadata"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-2xl">▶️</span>
        </button>
        {caption && (
          <p className={`px-3 py-1.5 text-sm ${isInbound ? '' : 'text-white'}`}>{caption}</p>
        )}
      </div>
    )
  }

  if (type === 'document') {
    if (!url) return <p className={unavailableClass}>📄 Documento não disponível</p>
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 px-3 py-2 text-sm ${isInbound ? 'text-blue-600 hover:text-blue-800' : 'text-white/90 underline'}`}
      >
        <span className="text-lg">📄</span>
        <span>Documento</span>
      </a>
    )
  }

  return null
}

// ── Separador de dia ──────────────────────────────────────────────────────────

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
  messages: MessageForBubble[],
  timezone: string,
): Array<
  | { type: 'separator'; label: string }
  | { type: 'message'; message: MessageForBubble; showTimestamp: boolean }
> {
  const result: ReturnType<typeof groupMessagesWithSeparators> = []
  let lastDayStr  = ''
  let lastMsgTime = 0

  for (const msg of messages) {
    const dayStr = formatTz(msg.created_at, 'yyyy-MM-dd', timezone)
    const msgTime = new Date(msg.created_at).getTime()

    if (dayStr !== lastDayStr) {
      const today     = formatTz(new Date(), 'yyyy-MM-dd', timezone)
      const yesterday = formatTz(new Date(Date.now() - 86_400_000), 'yyyy-MM-dd', timezone)
      const label     = dayStr === today     ? 'Hoje'
                      : dayStr === yesterday ? 'Ontem'
                      : formatTz(msg.created_at, "d 'de' MMMM", timezone)
      result.push({ type: 'separator', label })
      lastDayStr  = dayStr
      lastMsgTime = 0
    }

    const showTimestamp = msgTime - lastMsgTime > 5 * 60_000
    result.push({ type: 'message', message: msg, showTimestamp })
    lastMsgTime = msgTime
  }

  return result
}
