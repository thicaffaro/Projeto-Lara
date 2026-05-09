'use client'

/**
 * BackupTutorialModal.tsx
 * Tutorial de backup do WhatsApp em formato stepper com 6 telas.
 *
 * Telas:
 *  1. Por que fazer backup? (geral)
 *  2-3. Android (passo a passo)
 *  4-5. iPhone / iOS (passo a passo)
 *  6. Confirmação (geral)
 *
 * TODO (go-live): substituir todos os <ImagePlaceholder /> por screenshots reais.
 * Screenshots necessários:
 *  - android_settings_menu.png   (tela 2)
 *  - android_backup_screen.png   (tela 3)
 *  - ios_settings_tab.png        (tela 4)
 *  - ios_backup_screen.png       (tela 5)
 *
 * Acessibilidade:
 *  - role="dialog", aria-modal="true"
 *  - Focus trap via useFocusTrap
 *  - ESC fecha modal
 *  - reduced-motion respeitado
 */

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { strings } from '@/lib/strings'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'

// ── ImagePlaceholder ─────────────────────────────────────────────────────────

function ImagePlaceholder({ label }: { label: string }) {
  return (
    // TODO: substituir por <Image src={...} alt={label} /> com screenshot real antes do go-live
    <div
      aria-label={label}
      className="flex h-44 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 sm:h-52"
    >
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-gray-400">[{label}]</p>
        <p className="text-xs text-gray-300">Screenshot a ser inserido</p>
      </div>
    </div>
  )
}

// ── Ícones de plataforma ─────────────────────────────────────────────────────

const PLATFORM_ICON: Record<string, string> = {
  android: '🤖',
  ios: '🍎',
  all: '📱',
}

const PLATFORM_LABEL: Record<string, string> = {
  android: 'Android',
  ios: 'iPhone',
  all: '',
}

// ── Componente principal ─────────────────────────────────────────────────────

interface BackupTutorialModalProps {
  isOpen: boolean
  onClose: () => void
}

export function BackupTutorialModal({ isOpen, onClose }: BackupTutorialModalProps) {
  const shouldReduceMotion = useReducedMotion()
  const s = strings.preOnboarding.backup
  const containerRef = useFocusTrap<HTMLDivElement>({ isActive: isOpen, onEscape: onClose })

  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  const total   = s.screens.length
  const screen  = s.screens[currentIndex]
  const isFirst = currentIndex === 0
  const isLast  = currentIndex === total - 1

  const screenCount = s.screenCountTemplate
    .replace('{current}', String(currentIndex + 1))
    .replace('{total}', String(total))

  function goNext() {
    setDirection(1)
    setCurrentIndex(i => Math.min(i + 1, total - 1))
  }

  function goPrev() {
    setDirection(-1)
    setCurrentIndex(i => Math.max(i - 1, 0))
  }

  const slideVariants = {
    enter: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir * 40,
      opacity: shouldReduceMotion ? 1 : 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir * -40,
      opacity: shouldReduceMotion ? 1 : 0,
    }),
  }

  if (!isOpen) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      aria-hidden="true"
    >
      {/* Overlay escuro */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel do modal */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2
              id="backup-modal-title"
              className="text-base font-semibold text-gray-900"
            >
              {s.title}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">{screenCount}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar tutorial"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Indicador de progresso */}
        <div className="flex gap-1 px-5 py-3" aria-hidden="true">
          {s.screens.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= currentIndex ? 'bg-rose-400' : 'bg-gray-100'
              }`}
            />
          ))}
        </div>

        {/* Área de conteúdo com animação de slide */}
        <div className="overflow-hidden px-5 pb-2">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: 'easeInOut' }}
              className="space-y-4"
            >
              {/* Badge de plataforma */}
              {screen.platform !== 'all' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-base" aria-hidden="true">
                    {PLATFORM_ICON[screen.platform]}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    {PLATFORM_LABEL[screen.platform]}
                  </span>
                </div>
              )}

              {/* Título da tela */}
              <h3 className="text-lg font-bold text-gray-900">{screen.title}</h3>

              {/* Imagem placeholder */}
              {screen.platform !== 'all' && (
                <ImagePlaceholder
                  label={`${PLATFORM_LABEL[screen.platform]} — ${screen.title}`}
                />
              )}

              {/* Descrição */}
              <p className="text-sm leading-relaxed text-gray-600">{screen.description}</p>

              {/* Breadcrumb de caminho (quando disponível) */}
              {screen.pathLabel && (
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="font-mono text-xs text-gray-500">{screen.pathLabel}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navegação */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {s.navBack}
          </button>

          {isLast ? (
            <button
              onClick={onClose}
              className="rounded-xl bg-rose-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95"
            >
              {s.navDone}
            </button>
          ) : (
            <button
              onClick={goNext}
              className="rounded-xl bg-rose-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95"
            >
              {s.navNext}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
