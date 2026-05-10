'use client'

/**
 * RecoveryEmailEditButton.tsx
 * Botão inline que abre form para editar o email de recuperação.
 * Client Component extraído para não contaminar o Server Component da página.
 */

import { useState } from 'react'

interface Props {
  currentEmail: string | null
}

export function RecoveryEmailEditButton({ currentEmail }: Props) {
  const [open,    setOpen]    = useState(false)
  const [email,   setEmail]   = useState(currentEmail ?? '')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string>()
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    if (!email.trim()) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch('/api/dashboard/security/recovery-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Erro ao salvar'); return }
      setSuccess(true)
      setOpen(false)
      // Recarrega a página para mostrar email mascarado atualizado
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
      >
        {success ? '✅ Salvo' : currentEmail ? 'Editar email' : 'Adicionar email'}
      </button>
    )
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <input
        type="email"
        value={email}
        onChange={e => { setEmail(e.target.value); setError(undefined) }}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
        placeholder="seu@email.com"
        autoFocus
        aria-label="Email de recuperação"
        className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={loading || !email.trim()}
          className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
        >
          {loading ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          onClick={() => { setOpen(false); setError(undefined) }}
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
