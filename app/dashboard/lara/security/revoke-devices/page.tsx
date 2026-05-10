'use client'

/**
 * /app/dashboard/lara/security/revoke-devices/page.tsx
 * Tela de confirmação para encerrar todos os dispositivos.
 *
 * Exige PIN atual como confirmação explícita.
 * Após confirmação, exibe tela de sucesso com orientações.
 *
 * IMPORTANTE — o que acontece e o que NÃO acontece:
 * ✅ Encerra: todas as sessões ativas do painel (JWT + refresh tokens)
 * ✅ Envia:   link no WhatsApp para criar novo PIN
 * ❌ Não afeta: conexão WhatsApp, agendamentos, dados da conta
 */

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

type Phase = 'confirm' | 'success'

export default function RevokeDevicesPage() {
  const [phase,   setPhase]   = useState<Phase>('confirm')
  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState<string>()
  const [loading, setLoading] = useState(false)

  const pinRef = useRef<HTMLInputElement>(null)
  useEffect(() => { pinRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!/^\d{4}$/.test(pin)) {
      setError('Digite seu PIN de 4 dígitos para confirmar.')
      return
    }

    setLoading(true)
    setError(undefined)

    try {
      const res = await fetch('/api/dashboard/auth/revoke-all-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_pin: pin }),
      })

      const json = await res.json() as { ok?: boolean; error?: string; message?: string }

      if (!res.ok) {
        if (res.status === 401) {
          setError('PIN incorreto. Tente novamente.')
          setPin('')
          pinRef.current?.focus()
          return
        }
        setError(json.error ?? 'Erro ao processar. Tente novamente.')
        return
      }

      setPhase('success')
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Tela de sucesso ────────────────────────────────────────────────────────
  if (phase === 'success') {
    return (
      <main className="mx-auto max-w-sm px-4 py-12 text-center space-y-5">
        <p className="text-4xl" aria-hidden="true">✅</p>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dispositivos desconectados</h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            Todas as sessões foram encerradas. Você receberá um link no WhatsApp para criar um novo PIN e voltar a acessar o painel.
          </p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-left space-y-1.5">
          <p className="text-xs font-semibold text-blue-800">O que NÃO foi afetado:</p>
          {[
            'Sua conexão WhatsApp continua ativa',
            'Agendamentos e clientes continuam normais',
            'A Lara continua respondendo mensagens',
          ].map((item, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-blue-700">
              <span aria-hidden="true">✓</span>{item}
            </p>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Não recebeu o link?{' '}
          <a href="https://wa.me/5511978663056" className="text-rose-500 hover:underline">
            Falar com suporte
          </a>
        </p>
      </main>
    )
  }

  // ── Tela de confirmação ────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-sm px-4 py-12 space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Encerrar todos os dispositivos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Esta ação desconecta o painel de todos os dispositivos. Você receberá um link no WhatsApp para acessar novamente.
        </p>
      </div>

      {/* Aviso explicativo */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-800">O que acontece:</p>
        <ul className="space-y-1">
          {[
            { icon: '🔒', text: 'Todas as sessões ativas serão encerradas' },
            { icon: '📱', text: 'Você receberá um link no WhatsApp para criar novo PIN' },
            { icon: '✅', text: 'Conexão WhatsApp e agendamentos NÃO são afetados' },
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
              <span aria-hidden="true">{item.icon}</span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Form de confirmação por PIN */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="pin-confirm" className="block text-sm font-medium text-gray-700">
            Confirme seu PIN para prosseguir
          </label>
          <input
            id="pin-confirm"
            ref={pinRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{4}"
            value={pin}
            onChange={e => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              setError(undefined)
            }}
            placeholder="••••"
            aria-describedby={error ? 'pin-err' : undefined}
            aria-invalid={!!error}
            className={`mt-1 block w-full rounded-xl border px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 ${
              error
                ? 'border-red-400 focus:ring-red-200'
                : 'border-gray-300 focus:border-rose-400 focus:ring-rose-200'
            }`}
          />
          {error && (
            <p id="pin-err" role="alert" className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-2">
          {/* Cor warning (não red) — não é ação destrutiva, é reversível */}
          <button
            type="submit"
            disabled={pin.length < 4 || loading}
            className="w-full rounded-xl border border-amber-400 bg-amber-50 py-3.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 active:scale-95 disabled:opacity-40"
          >
            {loading ? 'Encerrando sessões…' : 'Confirmar encerramento'}
          </button>

          <Link
            href="/dashboard/lara/security"
            className="w-full rounded-xl border border-gray-200 py-3.5 text-center text-sm font-medium text-gray-500 transition hover:bg-gray-50"
          >
            Cancelar
          </Link>
        </div>
      </form>

      <p className="text-center text-xs text-gray-400">
        Não lembra do PIN?{' '}
        <Link href="/auth/forgot-pin" className="text-rose-500 hover:underline">
          Esqueci meu PIN
        </Link>
      </p>
    </main>
  )
}
