'use client'

/**
 * InstagramTeaser.tsx
 * Seção discreta sem CTA ativo — aviso de funcionalidade futura.
 * Instagram DM está como stub no schema (tabela instagram_accounts).
 */

import { motion } from 'framer-motion'
import { strings } from '@/lib/strings'

export function InstagramTeaser() {
  const s = strings.instagram

  return (
    <section className="bg-white px-4 py-10 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto flex max-w-lg items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 px-6 py-5 text-center"
      >
        <span className="text-xl" aria-hidden="true">📸</span>
        <p className="text-sm text-gray-500">{s.text}</p>
      </motion.div>
    </section>
  )
}
