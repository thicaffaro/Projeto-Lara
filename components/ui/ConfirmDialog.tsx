'use client'

import { BottomSheet } from './BottomSheet'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  loading?: boolean
}

export function ConfirmDialog({
  isOpen, onClose, onConfirm, title, description,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  variant = 'default', loading = false,
}: ConfirmDialogProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      {description && <p className="text-sm text-gray-500 mb-6">{description}</p>}
      <div className="flex flex-col gap-3 pb-4">
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`h-12 w-full rounded-2xl text-sm font-semibold text-white disabled:opacity-50 ${
            variant === 'danger' ? 'bg-red-500' : 'bg-rose-500'
          }`}
        >
          {loading ? 'Aguarde…' : confirmLabel}
        </button>
        <button
          onClick={onClose}
          disabled={loading}
          className="h-11 w-full rounded-2xl border border-gray-200 text-sm text-gray-600"
        >
          {cancelLabel}
        </button>
      </div>
    </BottomSheet>
  )
}
