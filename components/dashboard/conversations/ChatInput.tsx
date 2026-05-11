'use client'

import { useState, useRef } from 'react'
import { TemplatePicker } from './TemplatePicker'
import { strings }        from '@/lib/strings'

const s = strings.dashboard.conversations

interface Message {
  id: string; content: string | null; direction: 'inbound' | 'outbound'
  sent_by?: 'lara' | 'professional' | null; created_at: string
  message_type:   string
  media_url?:     string | null
  media_caption?: string | null
  media_type?:    string | null
}

interface Props {
  contactId: string
  professionalId: string
  contactPhoneNumber: string
  onMessageSent: (message: Message) => void
  isWithinMetaWindow: boolean
}

export function ChatInput({ contactId, professionalId, contactPhoneNumber, onMessageSent, isWithinMetaWindow }: Props) {
  const [text,         setText]         = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string>()
  const [showTemplate, setShowTemplate] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError(undefined)

    // Bolha otimista
    const optimistic: Message = {
      id:           `opt-${Date.now()}`,
      content:      trimmed,
      direction:    'outbound',
      sent_by:      'professional',
      created_at:   new Date().toISOString(),
      message_type: 'text',
    }
    onMessageSent(optimistic)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const res = await fetch('/api/dashboard/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, text: trimmed, contactPhoneNumber }),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setError(json.error ?? 'Erro ao enviar')
      }
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    // Auto-expand textarea
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px` // max 4 lines ~96px
  }

  // ── Fora da janela 24h ────────────────────────────────────────────────────
  if (!isWithinMetaWindow) {
    return (
      <div className="border-t border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
          <p className="flex-1 text-xs text-gray-500">
            ⏰ {s.windowExpired}
          </p>
          <button
            onClick={() => setShowTemplate(true)}
            className="shrink-0 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white"
          >
            {s.sendTemplate}
          </button>
        </div>
        <TemplatePicker
          contactId={contactId}
          professionalId={professionalId}
          contactPhoneNumber={contactPhoneNumber}
          isOpen={showTemplate}
          onClose={() => setShowTemplate(false)}
          onSent={() => {
            // Polled automaticamente pela conversa
          }}
        />
      </div>
    )
  }

  // ── Dentro da janela 24h ──────────────────────────────────────────────────
  return (
    <div className="border-t border-gray-100 bg-white px-3 py-2">
      {error && <p role="alert" className="mb-1 text-center text-xs text-red-500">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={s.inputPlaceholder}
          rows={1}
          disabled={loading}
          className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm leading-relaxed focus:border-rose-300 focus:outline-none focus:bg-white disabled:opacity-50"
          style={{ minHeight: 44, maxHeight: 96 }}
          aria-label="Campo de mensagem"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || loading}
          aria-label="Enviar mensagem"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm transition disabled:opacity-40"
        >
          {loading ? (
            <span className="text-xs animate-pulse">...</span>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
