'use client'

/**
 * WhatsAppQASection.tsx
 * 6 perguntas frequentes sobre WhatsApp em formato accordion.
 *
 * Acessibilidade (ARIA Accordion Pattern — APG):
 *   • Botão: id="qa-btn-{i}", aria-expanded, aria-controls="qa-panel-{i}"
 *   • Painel: id="qa-panel-{i}", role="region", aria-labelledby="qa-btn-{i}"
 *   • Teclado: Enter e Space tratados nativamente pelo elemento <button>
 *
 * Animação: Framer Motion AnimatePresence com suporte a prefers-reduced-motion.
 */

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { strings } from '@/lib/strings'

function AccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
  index,
}: {
  question: string
  answer: string
  isOpen: boolean
  onToggle: () => void
  index: number
}) {
  const shouldReduceMotion = useReducedMotion()

  const btnId   = `qa-btn-${index}`
  const panelId = `qa-panel-${index}`

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.35, delay: shouldReduceMotion ? 0 : index * 0.05 }}
      className="overflow-hidden rounded-2xl border border-gray-100 bg-white"
    >
      {/* ── Botão da pergunta ───────────────────────────────────────────── */}
      <button
        id={btnId}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
      >
        <span className="text-sm font-semibold text-gray-900 sm:text-base">
          {question}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          className="shrink-0 text-xl font-light text-rose-400"
          aria-hidden="true"
        >
          +
        </motion.span>
      </button>

      {/* ── Painel de resposta ──────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            id={panelId}
            role="region"
            aria-labelledby={btnId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm leading-relaxed text-gray-600">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function WhatsAppQASection() {
  const s = strings.whatsappQA
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (i: number) =>
    setOpenIndex(prev => (prev === i ? null : i))

  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-2xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          {s.title}
        </motion.h2>

        {/* role="list" semântico para leitores de tela */}
        <div role="list" className="flex flex-col gap-2">
          {s.questions.map((item, i) => (
            <div key={i} role="listitem">
              <AccordionItem
                index={i}
                question={item.q}
                answer={item.a}
                isOpen={openIndex === i}
                onToggle={() => toggle(i)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
