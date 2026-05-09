'use client'

/**
 * HeroSection.tsx
 * Proposta de valor principal da Lara.
 * Animação: fade + slide-up em sequência via Framer Motion.
 * Mobile-first (base 375px).
 *
 * prefers-reduced-motion: useReducedMotion() desativa fade/slide.
 * Conteúdo aparece estático sem qualquer transformação.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { strings } from '@/lib/strings'

export function HeroSection() {
  const shouldReduceMotion = useReducedMotion()
  const s = strings.hero

  // Variant definido dentro do componente para capturar shouldReduceMotion.
  // Quando reduzido: y fixo em 0 (sem slide), duration 0 (sem fade progressivo).
  const fadeUp = {
    hidden: {
      opacity: shouldReduceMotion ? 1 : 0,
      y: 0,                              // nunca desliza, independente do modo
    },
    visible: (delay: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.5,
        ease: 'easeOut',
        delay: shouldReduceMotion ? 0 : delay,
      },
    }),
  }

  return (
    <section className="relative overflow-hidden bg-white px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-24">
      {/* Gradiente decorativo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-rose-50 opacity-60 blur-3xl" />
      </div>

      <div className="mx-auto max-w-2xl text-center">
        {/* Badge */}
        <motion.p
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mb-4 inline-block rounded-full bg-rose-50 px-4 py-1.5 text-xs font-medium tracking-wide text-rose-600 sm:text-sm"
        >
          {s.badge}
        </motion.p>

        {/* Headline */}
        <motion.h1
          custom={0.1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl lg:text-5xl"
        >
          {s.headline}
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          custom={0.2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-5 text-base leading-relaxed text-gray-600 sm:text-lg"
        >
          {s.subheadline}
        </motion.p>

        {/* CTA */}
        <motion.div
          custom={0.35}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-8 flex flex-col items-center gap-3"
        >
          <a
            href="/cadastro"
            className="w-full max-w-xs rounded-xl bg-rose-500 px-8 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-rose-600 active:scale-95 sm:w-auto"
          >
            {s.cta}
          </a>

          {/* Nota metodologia */}
          <p className="text-xs text-gray-400">
            {s.methodologyNote.text}{' '}
            <a
              href="/docs/methodology"
              className="underline underline-offset-2 hover:text-gray-600"
            >
              {s.methodologyNote.linkLabel}
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  )
}
