'use client'

import { useState } from 'react'

export default function ExpiredPage() {
  const [loading,  setLoading]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [error,    setError]    = useState<string>()

  async function handleRenew() {
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch('/api/dashboard/auth/request-renewal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) { setSent(true) }
      else { setError('Não foi possível enviar. Fale com o suporte.') }
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-12 text-center">
      <div className="space-y-5 max-w-xs">
        <p className="text-4xl" aria-hidden="true">{sent ? '📩' : '🔗'}</p>
        <div>
          <h1 className="text-lg font-bold text-gray-900">
            {sent ? 'Link enviado!' : 'Link inválido ou expirou'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {sent
              ? 'Verifique seu WhatsApp. O novo link expira em 7 dias.'
              : 'Este link não existe ou já expirou. Solicite um novo link pelo WhatsApp.'}
          </p>
        </div>

        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

        {!sent && (
          <button
            onClick={handleRenew}
            disabled={loading}
            className="h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Solicitar novo link'}
          </button>
        )}

        <p className="text-xs text-gray-400">
          Precisa de ajuda?{' '}
          <a href="https://wa.me/5511978663056" className="text-rose-500 hover:underline">
            Falar com suporte
          </a>
        </p>
      </div>
    </main>
  )
}
