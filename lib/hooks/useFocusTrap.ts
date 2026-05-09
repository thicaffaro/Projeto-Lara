'use client'

/**
 * /lib/hooks/useFocusTrap.ts
 *
 * Hook que:
 * 1. Move o foco para o primeiro elemento focável do container quando ativado
 * 2. Mantém o foco dentro do container (Tab e Shift+Tab ciclam internamente)
 * 3. Chama onEscape() quando ESC é pressionado
 *
 * Usado em modais acessíveis: role="dialog", aria-modal="true".
 */

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])'

interface UseFocusTrapOptions {
  /** Ativa o trap quando true */
  isActive: boolean
  /** Chamado quando usuário pressiona ESC */
  onEscape: () => void
}

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  isActive,
  onEscape,
}: UseFocusTrapOptions) {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    if (!isActive) return

    const container = containerRef.current
    if (!container) return

    // Salva o elemento que estava com foco antes do modal abrir
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move foco para o primeiro elemento focável do modal
    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter(el => !el.hasAttribute('disabled'))

    focusableElements[0]?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape()
        return
      }

      if (event.key !== 'Tab') return

      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusableElements[0]
      const last  = focusableElements[focusableElements.length - 1]

      if (event.shiftKey) {
        // Shift+Tab: se no primeiro elemento, vai para o último
        if (document.activeElement === first) {
          event.preventDefault()
          last.focus()
        }
      } else {
        // Tab: se no último elemento, vai para o primeiro
        if (document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restaura foco ao elemento anterior quando modal fecha
      previouslyFocused?.focus()
    }
  }, [isActive, onEscape])

  return containerRef
}
