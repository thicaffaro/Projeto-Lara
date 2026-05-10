'use client'

/**
 * /app/auth/forgot-pin/page.tsx
 * Recuperação de PIN em 3 fases:
 *   fase 'phone'    → input do número de telefone
 *   fase 'channel'  → seleção de canal (SMS / email) com destinos mascarados
 *   fase 'sent'     → confirmação de envio
 */

import { useState } from 'react'
import Link from 'next/link'
import { maskPhone as maskPhoneInput, isValidBrazilianPhone, stripMask } from '@/lib/validation'

type Phase   = 'phone' | 'channel' | 'sent'
type Channel = 'sms' | 'email'

interface ChannelData {
  channels: Channel[]
  sms_destination: string
  email_destination?: string
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length >= 4 ? `***-${d.slice(-4)}` : '***-****'
}

export default function ForgotPinPage() {
  const [phase,       setPhase]       = useState<Phase>('phone')
  const [rawPhone,    setRawPhone]    = useState('')
  const [phoneMasked, setPhoneMasked] = useState('')
  const [phoneError,  setPhoneError]  = useState<string>()
  const [channelData, setChannelData] = useState<ChannelData | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string>()

  // ── Fase 1: submit do telefone ─────────────────────────────────────────────
  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    const digits = stripMask(rawPhone)

    if (!isValidBrazilianPhone(digits)) {
      setPhoneError('Telefone inválido. Ex: (11) 99999-9999')
      return
    }

    setLoading(true)
    setPhoneError(undefined)

    try {
      const res = await fetch(
        `/api/auth/forgot-pin/channels?phone=${encodeURIComponent(digits)}`,
        { cache: 'no-store' }
      )
      const data = await res.json() as ChannelData
      setChannelData(data)
      setPhase('channel')
    } catch {
      setPhoneError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Fase 2: seleção de canal e envio ──────────────────────────────────────
  async function handleChannelSelect(channel: Channel) {
    setLoading(true)
    setError(undefined)
    const digits = stripMask(rawPhone)

    try {
      await fetch('/api/auth/forgot-pin/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: digits, channel }),
      })
      // Sempre avança para 'sent' independente da resposta (200 sempre)
      setPhase('sent')
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Render: fase 'phone' ───────────────────────────────────────────────────
  if (phase === 'phone') {
    return (
      <main className="mx-auto max-w-sm px-4 py-12 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Esqueci meu PIN</h1>
          <p className="mt-1 text-sm text-gray-500">
            Informe o número de WhatsApp cadastrado na Lara. Enviaremos um link para resetar seu PIN.
          </p>
        </div>

        <form onSubmit={handlePhoneSubmit} className="space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Número de WhatsApp
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phoneMasked}
              onChange={e => {
                const m = maskPhone(e.target.value)
                setPhoneMasked(m)
                setRawPhone(m)
                setPhoneError(undefined)
              }}
              placeholder="(11) 99999-9999"
              maxLength={15}
              aria-describedby={phoneError ? 'phone-err' : undefined}
              aria-invalid={!!phoneError}
              className={`mt-1 block w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                phoneError
                  ? 'border-red-400 focus:ring-red-200'
                  : 'border-gray-300 focus:border-rose-400 focus:ring-rose-200'
              }`}
            />
            {phoneError && (
              <p id="phone-err" role="alert" className="mt-1 text-xs text-red-600">{phoneError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !rawPhone}
            className="w-full rounded-xl bg-rose-500 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
          >
            {loading ? 'Verificando…' : 'Continuar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          Lembrou o PIN?{' '}
          <Link href="/dashboard/lara/security" className="text-rose-500 hover:underline">
            Voltar
          </Link>
        </p>
      </main>
    )
  }

  // ── Render: fase 'channel' ─────────────────────────────────────────────────
  if (phase === 'channel' && channelData) {
    const hasBoth = channelData.channels.includes('email')

    return (
      <main className="mx-auto max-w-sm px-4 py-12 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Como você quer receber o link?</h1>
          <p className="mt-1 text-sm text-gray-500">
            {hasBoth
              ? 'Escolha onde enviar o link de recuperação:'
              : 'Enviaremos um link por SMS para o número cadastrado.'}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="space-y-3">
          {/* Opção SMS — sempre disponível */}
          <button
            onClick={() => handleChannelSelect('sms')}
            disabled={loading}
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white p-4 text-left transition hover:border-rose-300 disabled:opacity-50"
          >
            <span className="text-2xl" aria-hidden="true">📱</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">SMS</p>
              <p className="text-xs text-gray-500">{channelData.sms_destination}</p>
            </div>
          </button>

          {/* Opção Email — apenas se disponível */}
          {hasBoth && channelData.email_destination && (
            <button
              onClick={() => handleChannelSelect('email')}
              disabled={loading}
              className="flex w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white p-4 text-left transition hover:border-rose-300 disabled:opacity-50"
            >
              <span className="text-2xl" aria-hidden="true">📧</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Email</p>
                <p className="text-xs text-gray-500">{channelData.email_destination}</p>
              </div>
            </button>
          )}
        </div>

        {loading && (
          <p className="text-center text-xs text-gray-400 animate-pulse">Enviando…</p>
        )}

        <button
          onClick={() => setPhase('phone')}
          className="text-sm text-gray-400 underline-offset-2 hover:underline"
        >
          ← Usar outro número
        </button>
      </main>
    )
  }

  // ── Render: fase 'sent' ────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-sm px-4 py-12 text-center space-y-5">
      <p className="text-4xl" aria-hidden="true">📩</p>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Link enviado!</h1>
        <p className="mt-2 text-sm text-gray-500">
          Se o número informado tiver uma conta na Lara, você receberá o link para resetar o PIN em breve.
          O link expira em <strong>30 minutos</strong>.
        </p>
      </div>
      <p className="text-xs text-gray-400">
        Não recebeu?{' '}
        <button
          onClick={() => setPhase('phone')}
          className="text-rose-500 underline-offset-2 hover:underline"
        >
          Tentar novamente
        </button>
      </p>
    </main>
  )
}
