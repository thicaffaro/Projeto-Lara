/**
 * /app/onboarding/setup/complete/page.tsx
 * Tela final após conclusão do onboarding de 7 passos.
 */

'use client'

import Link from 'next/link'

const LARA_PHONE_DISPLAY = '11 97866-3056'
const LARA_WA_HREF       = 'https://wa.me/5511978663056'

export default function OnboardingCompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-md space-y-6 text-center">
        {/* Ícone e título */}
        <div className="space-y-2">
          <div className="text-5xl" aria-hidden="true">✨</div>
          <h1 className="text-2xl font-bold text-gray-900">
            Pronto! Sua Lara está configurada.
          </h1>
        </div>

        {/* Mensagem de espera dos templates */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-6 py-5 text-left">
          <p className="text-sm leading-relaxed text-blue-800">
            Agora ela está aguardando aprovação dos seus templates pela Meta
            (geralmente 1-2 dias). Quando estiverem aprovados, você recebe uma
            mensagem da Lara avisando que pode começar a usar com clientes.
          </p>
          <p className="mt-3 text-sm font-semibold text-blue-900">
            Seu trial de 7 dias só começa nesse momento — você não perde nem um dia. 🎉
          </p>
        </div>

        {/* Próximos passos */}
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-5 text-left space-y-3">
          <p className="text-sm font-semibold text-gray-800">Por enquanto:</p>
          <ul className="space-y-2">
            {[
              { icon: '📱', text: `Salve nosso número ${LARA_PHONE_DISPLAY} como "Lara Assistente"` },
              { icon: '🛠️', text: 'Pode mexer nas configurações se quiser ajustar algo' },
              { icon: '👀', text: 'Pode adicionar mais contatos pessoais (família, amigos) na aba Contatos' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span aria-hidden="true">{item.icon}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <a
            href={LARA_WA_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
          >
            <span aria-hidden="true">💾</span>
            Salvar Lara nos contatos
          </a>

          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center rounded-xl border border-gray-200 py-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Ir pro painel →
          </Link>
        </div>

        <p className="text-xs text-gray-400">
          Dúvidas? Fale com nosso suporte pelo WhatsApp: {LARA_PHONE_DISPLAY}
        </p>
      </div>
    </main>
  )
}
