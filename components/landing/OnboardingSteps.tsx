'use client'

/**
 * OnboardingSteps.tsx
 * 3 passos com linha conectora horizontal (desktop) / vertical (mobile).
 */

import { motion } from 'framer-motion'
import { strings } from '@/lib/strings'

const steps = ['step1', 'step2', 'step3'] as const

export function OnboardingSteps() {
  const s = strings.onboarding

  const items = [s.step1, s.step2, s.step3]

  return (
    <section className="bg-rose-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          Começar leva menos de 10 minutos
        </motion.h2>

        {/* Steps */}
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-0">
          {/* Linha conectora horizontal (desktop) */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-5 hidden h-px bg-rose-200 sm:block"
            style={{ left: '10%', right: '10%' }}
          />

          {items.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.15 }}
              className="relative flex flex-1 flex-col items-center gap-3 text-center"
            >
              {/* Número */}
              <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white shadow-sm">
                {i + 1}
              </div>

              {/* Título */}
              <h3 className="text-base font-semibold text-gray-900">
                {step.title}
              </h3>

              {/* Descrição */}
              <p className="max-w-[200px] text-sm leading-relaxed text-gray-600">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA final */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <a
            href="/cadastro"
            className="inline-block rounded-xl bg-rose-500 px-8 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-rose-600 active:scale-95"
          >
            Começar agora grátis
          </a>
        </motion.div>
      </div>
    </section>
  )
}
