/**
 * /app/cadastro/page.tsx
 * Página de cadastro / início do trial.
 *
 * Ponto de entrada para novos usuários vindos dos botões CTA da landing page.
 *
 * Fluxo:
 *  1. Usuário preenche nome, telefone, CPF/CNPJ
 *  2. Autoriza o WhatsApp Business via Meta Embedded Signup
 *  3. POST /api/onboarding/exchange-token → cria professional + auth user
 *  4. POST /api/onboarding/register-number
 *  5. POST /api/onboarding/verify-code
 *  6. Redireciona para /onboarding/setup (configurações)
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { EmbeddedSignupForm } from '@/components/forms/EmbeddedSignupForm'

export const metadata: Metadata = {
  title: 'Cadastro — Lara',
  description: 'Conecte seu WhatsApp e comece seu teste grátis de 7 dias.',
  robots: { index: false, follow: false },
}

export default function CadastroPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-xl font-bold text-gray-900 hover:text-rose-500 transition-colors"
          >
            Lara
          </Link>
          <p className="mt-2 text-sm text-gray-500">
            7 dias grátis • Sem cartão de crédito
          </p>
        </div>

        {/* Formulário de onboarding */}
        <EmbeddedSignupForm mode="onboarding" />

        {/* Rodapé */}
        <p className="mt-8 text-center text-xs text-gray-400">
          Ao continuar, você concorda com os{' '}
          <a
            href="/public/legal/terms.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-gray-600"
          >
            Termos de Uso
          </a>{' '}
          e a{' '}
          <a
            href="/public/legal/privacy.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-gray-600"
          >
            Política de Privacidade
          </a>
          .
        </p>
      </div>
    </main>
  )
}
