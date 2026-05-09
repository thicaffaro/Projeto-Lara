'use client'

/**
 * ProductExplainerSection.tsx
 * COMPONENTE CENTRAL da landing — explica o conceito de automação seletiva.
 *
 * Layout: 2 colunas em desktop, empilhado em mobile.
 * Coluna esquerda: o que a Lara cuida (automático)
 * Coluna direita: o que a profissional responde (manual)
 *
 * Posicionamento crítico: Lara NÃO responde tudo — é camada SELETIVA.
 * Modos da Lara: full | booking_only | silent (ver /docs/glossary.md)
 *
 * prefers-reduced-motion: useReducedMotion() desativa slide/fade em todos os elementos.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { strings } from '@/lib/strings'

export function ProductExplainerSection() {
  const shouldReduceMotion = useReducedMotion()
  const s = strings.productExplainer

  // Variant definido dentro do componente para capturar shouldReduceMotion.
  const fadeUp = {
    hidden: { opacity: shouldReduceMotion ? 1 : 0, y: 0 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.4,
        ease: 'easeOut',
        delay: shouldReduceMotion ? 0 : i * 0.08,
      },
    }),
  }

  const d = (base: number) => (shouldReduceMotion ? 0 : base)

  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-5xl">
        {/* Título */}
        <motion.h2
          initial={{ opacity: shouldReduceMotion ? 1 : 0, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: d(0.5) }}
          className="mb-10 text-center text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          {s.title}
        </motion.h2>

        {/* Grade de 2 colunas */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Coluna esquerda — Lara cuida */}
          <motion.div
            initial={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: d(0.5) }}
            className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🤖</span>
              <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
                {s.laraColumn.title}
              </h3>
            </div>
            <ul className="space-y-3">
              {s.laraColumn.items.map((item, i) => (
                <motion.li
                  key={i}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="flex items-start gap-2 text-sm leading-relaxed text-gray-700"
                >
                  <span className="mt-0.5 shrink-0 text-rose-400" aria-hidden="true">✓</span>
                  {item}
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Coluna direita — Você responde */}
          <motion.div
            initial={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: d(0.5), delay: d(0.1) }}
            className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">👤</span>
              <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
                {s.youColumn.title}
              </h3>
            </div>
            <ul className="space-y-3">
              {s.youColumn.items.map((item, i) => (
                <motion.li
                  key={i}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="flex items-start gap-2 text-sm leading-relaxed text-gray-700"
                >
                  <span className="mt-0.5 shrink-0 text-gray-300" aria-hidden="true">→</span>
                  {item}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Texto explicativo */}
        <motion.p
          initial={{ opacity: shouldReduceMotion ? 1 : 0, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: d(0.5), delay: d(0.2) }}
          className="mt-8 text-center text-sm leading-relaxed text-gray-600 sm:text-base"
        >
          {s.bottomText}
        </motion.p>

        {/* CTA secundário */}
        <motion.div
          initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: d(0.4), delay: d(0.3) }}
          className="mt-4 text-center"
        >
          <a
            href={s.learnMoreLink.href}
            className="text-sm font-medium text-rose-500 underline-offset-2 hover:underline"
          >
            {s.learnMoreLink.label}
          </a>
        </motion.div>
      </div>
    </section>
  )
}
