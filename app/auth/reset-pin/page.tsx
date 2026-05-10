/**
 * /app/auth/reset-pin/page.tsx
 * Server Component que valida o token e renderiza o formulário ou tela de erro.
 *
 * URL: /auth/reset-pin?token=UUID
 * Válido  → renderiza ResetPinForm
 * Inválido → tela "Link inválido ou expirou"
 */

import { ResetPinForm } from './ResetPinForm'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ token?: string }>
}

const REASON_MESSAGES: Record<string, string> = {
  token_not_found: 'Este link não existe ou já foi apagado.',
  already_used:    'Este link já foi utilizado. Solicite um novo.',
  expired:         'Este link expirou (validade de 30 minutos).',
  invalid_purpose: 'Este link não é válido para reset de PIN.',
}

export default async function ResetPinPage({ searchParams }: Props) {
  const { token } = await searchParams

  // Token ausente na URL
  if (!token) {
    return <InvalidTokenScreen reason="token_missing" />
  }

  // Valida token via API interna (Server Component pode chamar diretamente a lógica,
  // mas usamos o endpoint para reutilização e separação de responsabilidades)
  let valid = false
  let reason = 'token_not_found'

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(
      `${baseUrl}/api/auth/reset-pin/validate?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    )
    const json = await res.json() as { valid: boolean; reason?: string }
    valid  = json.valid
    reason = json.reason ?? 'token_not_found'
  } catch {
    reason = 'server_error'
  }

  if (!valid) {
    return <InvalidTokenScreen reason={reason} />
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Criar novo PIN</h1>
        <p className="mt-1 text-sm text-gray-500">
          Escolha um PIN de 4 dígitos para acessar o painel da Lara.
        </p>
      </div>
      <ResetPinForm token={token} />
    </main>
  )
}

function InvalidTokenScreen({ reason }: { reason: string }) {
  const message = REASON_MESSAGES[reason] ?? 'Este link é inválido ou expirou.'

  return (
    <main className="mx-auto max-w-sm px-4 py-12 text-center space-y-5">
      <p className="text-4xl" aria-hidden="true">🔗</p>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Link inválido ou expirou</h1>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
      </div>
      <Link
        href="/auth/forgot-pin"
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-rose-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
      >
        Pedir novo link
      </Link>
      <p className="text-xs text-gray-400">
        Precisa de ajuda?{' '}
        <a href="https://wa.me/5511978663056" className="text-rose-500 hover:underline">
          Falar com suporte
        </a>
      </p>
    </main>
  )
}
