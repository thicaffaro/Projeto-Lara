'use client'

/**
 * LGPDFooter.tsx
 * Rodapé com consentimento LGPD visível e links legais.
 *
 * ⚠️  ATENÇÃO JURÍDICA (interno — não exibido na UI):
 *   Os documentos em /public/legal/ PRECISAM mencionar explicitamente:
 *   1. A arquitetura de "modos" da Lara (full / booking_only / silent)
 *   2. Que a Lara processa APENAS conversas autorizadas pela profissional
 *   3. Que contatos do tipo 'personal' e 'silent' nunca têm seus dados processados pela IA
 *   4. Os tipos de dados coletados: mensagens de WhatsApp, fotos, áudios de clientes finais
 *   5. Tempo de retenção: 12 meses para mídia (bucket client-media)
 *   Base legal: execução de contrato (Art. 7º, V, LGPD) para processamento de agendamentos.
 *   Consultar advogado especializado em LGPD antes do go-live.
 */

import { strings } from '@/lib/strings'

export function LGPDFooter() {
  const s = strings.footer

  return (
    <footer className="border-t border-gray-100 bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-5 text-center">
        {/* Texto de consentimento LGPD */}
        <p className="text-xs leading-relaxed text-gray-500">
          {s.consent}
        </p>

        {/* Links legais */}
        <nav aria-label="Links legais" className="flex flex-wrap justify-center gap-4">
          <a
            href="/public/legal/privacy.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
          >
            {s.privacy}
          </a>
          <span className="text-gray-200" aria-hidden="true">|</span>
          <a
            href="/public/legal/terms.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
          >
            {s.terms}
          </a>
          <span className="text-gray-200" aria-hidden="true">|</span>
          <a
            href={`mailto:${s.contact}`}
            className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
          >
            {s.contact}
          </a>
        </nav>

        {/* Crédito */}
        <p className="text-xs text-gray-300">
          © {new Date().getFullYear()} Lara Assistente. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
