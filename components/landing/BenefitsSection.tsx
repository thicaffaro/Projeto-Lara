'use client'

/**
 * BenefitsSection.tsx
 * 3 cards de benefícios concretos da Lara.
 * Vocabulário: "sessão" (não "horário"), "protocolo" (não "serviço"), "cliente" para cliente final.
 */

import { motion } from 'framer-motion'
import { strings } from '@/lib/strings'

const ICONS = ['💬', '🔔', '🏠'] as const

export function BenefitsSection() {
  const s = strings.benefits
  const cards = [s.notResponding, s.reminders, s.personalLifeStaysYours]

  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-6 sm:grid-cols-3">
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, ease: 'easeOut', delay: i * 0.1 }}
              className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-6"
            >
              <span className="text-2xl" aria-hidden="true">{ICONS[i]}</span>
              <h3 className="text-base font-semibold leading-snug text-gray-900">
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed text-gray-600">
                {card.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
