'use client'

/**
 * PricingSection.tsx
 * Plano único R$ 99/mês com trial de 7 dias.
 *
 * Notas importantes refletidas no copy:
 * - Pessoa física aceita (CPF, sem CNPJ)
 * - Trial inicia após aprovação dos templates Meta (trial_pending_templates → trial)
 *   ver subscription_status em 0001_initial.sql
 * - Studio OU domicílio (service_mode: studio | home, nunca ambos)
 */

import { motion } from 'framer-motion'
import { strings } from '@/lib/strings'

export function PricingSection() {
  const s = strings.pricing

  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-lg"
        >
          {/* Cabeçalho do card */}
          <div className="bg-rose-500 px-8 py-8 text-center">
            <p className="text-sm font-medium text-rose-100">{s.plan}</p>
            <div className="mt-2 flex items-end justify-center gap-1">
              <span className="text-2xl font-medium text-white">R$</span>
              <span className="text-6xl font-bold text-white leading-none">99</span>
              <span className="mb-2 text-lg text-rose-200">/mês</span>
            </div>
            <p className="mt-3 text-sm text-rose-100">{s.trialNote}</p>
          </div>

          {/* Lista de itens inclusos */}
          <div className="px-8 py-6">
            <ul className="space-y-3">
              {s.included.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="mt-0.5 shrink-0 text-rose-400" aria-hidden="true">✓</span>
                  {item}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <a
              href="/cadastro"
              className="mt-8 block w-full rounded-xl bg-rose-500 px-6 py-4 text-center text-base font-semibold text-white shadow-sm transition hover:bg-rose-600 active:scale-95"
            >
              {s.cta}
            </a>

            {/* Notas finais */}
            <div className="mt-5 space-y-1.5">
              {s.notes.map((note, i) => (
                <p key={i} className="text-center text-xs text-gray-400">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
