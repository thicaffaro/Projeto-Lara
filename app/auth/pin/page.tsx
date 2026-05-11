'use client'

export const dynamic = 'force-dynamic'

/**
 * /app/auth/pin/page.tsx
 * Login com PIN de 4 dígitos. Lock após 5 erros por 15min.
 */

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PinInput } from '@/components/dashboard/PinInput'
import Link from 'next/link'

export default function PinLoginPage() {
  return <Suspense><PinLoginContent /></Suspense>
}

function PinLoginContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pid          = searchParams.get('pid') ?? ''

  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState<string>()
  const [loading, setLoading] = useState(false)
  const [locked,  setLocked]  = useState(false)
  const [lockMin, setLockMin] = useState(0)

  async function handleVerify() {
    if (pin.length < 4) return

    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch('/api/dashboard/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professional_id: pid, pin }),
      })
      const json = await res.json() as {
        ok?: boolean
        error?: string
        locked?: boolean
        lock_minutes?: number
        remaining?: number
      }

      if (!res.ok) {
        if (json.locked) {
          setLocked(true)
          setLockMin(json.lock_minutes ?? 15)
          return
        }
        const rem = json.remaining ?? 0
        setError(
          rem === 1
            ? 'PIN incorreto. 1 tentativa restante antes do bloqueio.'
            : rem > 0
              ? `PIN incorreto. ${rem} tentativas restantes.`
              : 'PIN incorreto.'
        )
        setPin('')
        return
      }

      router.replace('/dashboard')
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (locked) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-12 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-4 text-lg font-bold text-gray-900">Acesso temporariamente bloqueado</h1>
        <p className="mt-2 text-sm text-gray-500">
          Muitas tentativas incorretas. Tente novamente em {lockMin} minuto(s).
        </p>
        <Link href="/auth/forgot-pin" className="mt-6 text-sm text-rose-500 underline-offset-2 hover:underline">
          Esqueci meu PIN
        </Link>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-xs space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-rose-500">Lara</p>
          <h1 className="mt-2 text-lg font-bold text-gray-900">Digite seu PIN</h1>
          <p className="mt-1 text-sm text-gray-500">4 dígitos para acessar o painel.</p>
        </div>

        <PinInput
          value={pin}
          onChange={v => { setPin(v); setError(undefined) }}
          label="PIN de acesso"
          disabled={loading}
          autoFocus
        />

        {error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}

        <button
          onClick={handleVerify}
          disabled={pin.length < 4 || loading}
          className="h-12 w-full rounded-2xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? 'Verificando…' : 'Entrar'}
        </button>

        <div className="flex justify-center">
          <Link href="/auth/forgot-pin" className="text-sm text-gray-400 underline-offset-2 hover:underline">
            Esqueci meu PIN
          </Link>
        </div>
      </div>
    </main>
  )
}
