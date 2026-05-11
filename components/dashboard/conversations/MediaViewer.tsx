'use client'

/**
 * /components/dashboard/conversations/MediaViewer.tsx
 * Lightbox fullscreen para visualizar imagens e vídeos.
 *
 * Funcionalidades:
 *  - Overlay escuro (z-50) com foco acessível
 *  - Imagem: touch-action: pinch-zoom para zoom nativo
 *  - Vídeo: player nativo fullscreen
 *  - Fechar: botão X, tap no overlay, tecla Escape
 *  - Botão de download (abre em nova aba)
 */

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface MediaViewerProps {
  url:     string
  type:    'image' | 'video'
  isOpen:  boolean
  onClose: () => void
}

export function MediaViewer({ url, type, isOpen, onClose }: MediaViewerProps) {
  // Fechar com Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      // Bloquear scroll do body
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de mídia"
        >
          {/* Barra superior */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
            onClick={e => e.stopPropagation()}
          >
            <span className="text-xs text-gray-300 font-medium">
              {type === 'image' ? '📷 Foto' : '🎬 Vídeo'}
            </span>
            <div className="flex items-center gap-3">
              {/* Botão de download */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                aria-label="Baixar"
                onClick={e => e.stopPropagation()}
              >
                ⬇️
              </a>
              {/* Botão fechar */}
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition text-lg"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Conteúdo da mídia */}
          <div
            className="relative flex max-h-[85vh] max-w-[95vw] items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            {type === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt="Foto em tela cheia"
                className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain select-none"
                style={{ touchAction: 'pinch-zoom' }}
                draggable={false}
              />
            )}

            {type === 'video' && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={url}
                controls
                autoPlay
                className="max-h-[85vh] max-w-[95vw] rounded-lg"
                style={{ touchAction: 'manipulation' }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
