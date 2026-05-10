'use client'

/**
 * PreOnboardingModal.tsx
 *
 * Modal OBRIGATÓRIO exibido antes do Embedded Signup começar.
 * Explica o que muda com a conexão ao WhatsApp Business API.
 *
 * Fluxo:
 *  1. Modal abre
 *  2. Profissional lê o conteúdo
 *  3. Opcionalmente abre BackupTutorialModal
 *  4. Marca os 3 checkboxes obrigatórios
 *  5. Botão "Continuar" é liberado → chama onContinue()
 *
 * Acessibilidade:
 *  - role="dialog", aria-modal="true", aria-labelledby
 *  - Focus trap via useFocusTrap (ESC fecha, Tab/Shift+Tab ciclam internamente)
 *  - Reduced motion respeitado
 *  - Checkboxes com label explícito via htmlFor/id
 *
 * Vocabulário: ver /docs/glossary.md
 *  - "sessão" não "horário"
 *  - "protocolo" não "serviço"
 */

import { useState, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { strings } from '@/lib/strings'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { BackupTutorialModal } from './BackupTutorialModal'

interface PreOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onContinue: () => void
}

// ── Sub-componente: seção de lista ────────────────────────────────────────────

function SectionList({ heading, items }: { heading: string; items: readonly string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-gray-800">{heading}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <span className="mt-0.5 shrink-0 text-gray-300" aria-hidden="true">–</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Sub-componente: checkbox com label ─────────────────────────────────────

function RequiredCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 transition hover:bg-gray-100"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-rose-500"
      />
      <span className="text-sm leading-relaxed text-gray-700">{label}</span>
    </label>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PreOnboardingModal({
  isOpen,
  onClose,
  onContinue,
}: PreOnboardingModalProps) {
  const shouldReduceMotion = useReducedMotion()
  const s = strings.preOnboarding.modal

  const [showBackup, setShowBackup] = useState(false)
  // Array de 3 booleans — índice alinhado com s.checkboxes[i]
  // Evita type assertion ao acessar checks[i] dinamicamente
  const [checks, setChecks] = useState<[boolean, boolean, boolean]>([false, false, false])

  const allChecked = checks[0] && checks[1] && checks[2]

  const handleEscape = useCallback(() => {
    if (showBackup) {
      setShowBackup(false)
    } else {
      onClose()
    }
  }, [showBackup, onClose])

  // Focus trap só ativo quando o modal principal está visível (não quando backup está aberto)
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen && !showBackup,
    onEscape: handleEscape,
  })

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: shouldReduceMotion ? 1 : 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
              className="fixed inset-0 z-40 bg-black/50"
              aria-hidden="true"
              onClick={onClose}
            />

            {/* Painel do modal */}
            <motion.div
              key="panel"
              initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 24 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.25, ease: 'easeOut' }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:inset-0 sm:m-auto sm:rounded-2xl"
            >
              <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pre-onboarding-title"
                className="flex flex-col overflow-hidden"
              >
                {/* Barra de arraste (mobile) */}
                <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
                  <div className="h-1 w-10 rounded-full bg-gray-200" />
                </div>

                {/* Cabeçalho */}
                <div className="flex items-start justify-between px-5 pb-3 pt-4">
                  <div className="pr-4">
                    <h2
                      id="pre-onboarding-title"
                      className="text-base font-bold text-gray-900 sm:text-lg"
                    >
                      {s.title}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">{s.subtitle}</p>
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Fechar"
                    className="shrink-0 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                {/* Conteúdo com scroll */}
                <div className="flex-1 overflow-y-auto px-5 pb-2">
                  <div className="space-y-5">
                    <SectionList
                      heading={s.continuesSection.heading}
                      items={s.continuesSection.items}
                    />
                    <SectionList
                      heading={s.laraSection.heading}
                      items={s.laraSection.items}
                    />
                    <SectionList
                      heading={s.youDecideSection.heading}
                      items={s.youDecideSection.items}
                    />
                    <SectionList
                      heading={s.changesSection.heading}
                      items={s.changesSection.items}
                    />

                    {/* Botão do tutorial de backup */}
                    <button
                      onClick={() => setShowBackup(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-100 active:scale-95"
                    >
                      <span aria-hidden="true">📱</span>
                      {s.backupButtonLabel}
                    </button>

                    {/* Checkboxes obrigatórios */}
                    <fieldset className="space-y-2">
                      <legend className="sr-only">
                        Confirmações obrigatórias para prosseguir
                      </legend>
                      {s.checkboxes.map((label, i) => (
                        <RequiredCheckbox
                          key={i}
                          id={`pre-onboarding-check-${i}`}
                          label={label}
                          checked={checks[i]}
                          onChange={v =>
                            setChecks(prev => {
                              const next: [boolean, boolean, boolean] = [...prev]
                              next[i] = v
                              return next
                            })
                          }
                        />
                      ))}
                    </fieldset>
                  </div>
                </div>

                {/* Rodapé com CTAs */}
                <div className="border-t border-gray-100 px-5 py-4 space-y-2">
                  <button
                    onClick={onContinue}
                    disabled={!allChecked}
                    aria-disabled={!allChecked}
                    className="w-full rounded-xl bg-rose-500 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {s.ctaLabel}
                  </button>
                  <a
                    href={s.supportHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-100 px-6 py-3 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
                  >
                    <span aria-hidden="true">💬</span>
                    {s.supportLabel}
                  </a>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Tutorial de backup — z-index maior que o modal principal */}
      <BackupTutorialModal
        isOpen={showBackup}
        onClose={() => setShowBackup(false)}
      />
    </>
  )
}
