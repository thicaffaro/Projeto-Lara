'use client'

import { useEffect, useState } from 'react'
import { BottomSheet }  from '@/components/ui/BottomSheet'
import { strings }      from '@/lib/strings'

const s = strings.dashboard.conversations

interface Template {
  id: string
  name: string
  variant: string
  body?: string
}

interface Props {
  contactId: string
  professionalId: string
  contactPhoneNumber: string
  isOpen: boolean
  onClose: () => void
  onSent: () => void
}

export function TemplatePicker({ contactId, professionalId, isOpen, onClose, onSent, contactPhoneNumber }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading,   setLoading]   = useState(false)
  const [sending,   setSending]   = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch(`/api/dashboard/templates?professionalId=${professionalId}`)
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
      .finally(() => setLoading(false))
  }, [isOpen, professionalId])

  async function handleSelect(template: Template) {
    setSending(template.id)
    try {
      await fetch('/api/dashboard/messages/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId, contactPhoneNumber,
          templateName: template.name,
          templateParams: [], // MVP: params vazios — profissional usa templates pré-preenchidos
          fallbackText: template.body ?? '',
        }),
      })
      onSent()
      onClose()
    } finally {
      setSending(null)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Enviar template" size="expanded">
      <div className="pb-4">
        {loading && <p className="py-8 text-center text-sm text-gray-400 animate-pulse">Carregando…</p>}

        {!loading && templates.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-2xl" aria-hidden="true">⏳</p>
            <p className="mt-2 text-sm text-gray-500">{s.noTemplates}</p>
          </div>
        )}

        {!loading && templates.length > 0 && (
          <div className="space-y-2">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => handleSelect(t)}
                disabled={!!sending}
                className="flex w-full flex-col gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                    {t.name.replace(/_/g, ' ')}
                  </span>
                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
                    v{t.variant?.toUpperCase()}
                  </span>
                </div>
                {t.body && (
                  <p className="text-xs text-gray-600 line-clamp-2">{t.body}</p>
                )}
                {sending === t.id && (
                  <p className="text-[10px] text-rose-500 animate-pulse">Enviando…</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
