'use client'

/**
 * DemoSection.tsx
 * Dois mockups de conversa de WhatsApp em sequência:
 *   1. Cliente agendando — Lara responde (lara_mode: full ou booking_only)
 *   2. Mensagem pessoal (mãe) — Lara em silêncio (lara_mode: silent)
 *
 * Bolhas aparecem com delay de 1.2s entre cada uma.
 * Mobile: empilhados verticalmente. Desktop: lado a lado.
 *
 * prefers-reduced-motion: delay e duration zerados — todas as bolhas
 * aparecem instantaneamente sem fade ou slide.
 *
 * Arquitetura de referência:
 *   - contact_type='client'  + lara_mode='full' → Lara responde
 *   - contact_type='personal' + lara_mode='silent' → Lara silencia
 */

import { motion, useReducedMotion } from 'framer-motion'
import { strings } from '@/lib/strings'

type Message = { from: string; text: string }

function ChatBubble({ msg, index }: { msg: Message; index: number }) {
  const shouldReduceMotion = useReducedMotion()

  const isLara   = msg.from === 'lara'
  const isSystem = msg.from === 'system'
  const isClient = msg.from === 'client' || msg.from === 'mae'

  return (
    <motion.div
      initial={{
        opacity: shouldReduceMotion ? 1 : 0,
        y: shouldReduceMotion ? 0 : 10,
      }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.35,
        delay: shouldReduceMotion ? 0 : index * 1.2,
      }}
      className={`flex ${isClient ? 'justify-start' : isLara ? 'justify-end' : 'justify-center'}`}
    >
      {isSystem ? (
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
          {msg.text}
        </span>
      ) : (
        <div
          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isLara
              ? 'rounded-br-sm bg-rose-500 text-white'
              : 'rounded-bl-sm bg-gray-100 text-gray-800'
          }`}
        >
          {msg.text}
        </div>
      )}
    </motion.div>
  )
}

function MockupPhone({
  title,
  messages,
  accentColor,
}: {
  title: string
  messages: readonly Message[]
  accentColor: 'rose' | 'gray'
}) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className={`mb-1 text-xs font-semibold uppercase tracking-widest ${
          accentColor === 'rose' ? 'text-rose-500' : 'text-gray-400'
        }`}
      >
        {title}
      </p>

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-md">
        {/* Barra de status simulada */}
        <div
          className={`flex items-center gap-2 px-4 py-3 ${
            accentColor === 'rose' ? 'bg-rose-500' : 'bg-gray-600'
          }`}
          aria-hidden="true"
        >
          <div className="h-8 w-8 rounded-full bg-white/20" />
          <div>
            <div className="h-2.5 w-20 rounded-full bg-white/80" />
            <div className="mt-1 h-2 w-12 rounded-full bg-white/40" />
          </div>
        </div>

        {/* Mensagens */}
        <div
          className="flex flex-col gap-2.5 bg-[#ece5dd] p-4"
          aria-label={`Conversa: ${title}`}
        >
          {messages.map((msg, i) => (
            <ChatBubble key={i} msg={msg} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function DemoSection() {
  const shouldReduceMotion = useReducedMotion()
  const s = strings.demo

  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: shouldReduceMotion ? 1 : 0, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
          className="mb-10 text-center text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          Veja os dois comportamentos
        </motion.h2>

        <div className="grid gap-8 sm:grid-cols-2">
          <MockupPhone
            title={s.clientBooking.title}
            messages={s.clientBooking.messages}
            accentColor="rose"
          />
          <MockupPhone
            title={s.personalMessage.title}
            messages={s.personalMessage.messages}
            accentColor="gray"
          />
        </div>
      </div>
    </section>
  )
}
