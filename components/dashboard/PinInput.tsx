'use client'

/**
 * PinInput.tsx
 * Input de PIN de 4 dígitos com UX nativa:
 * - 4 boxes separados, cada um aceita 1 dígito
 * - Auto-foco avança ao digitar (após 4 dígitos, vai para próximo campo)
 * - Backspace no 1º dígito vazio volta para o input anterior
 * - Paste distribui dígitos entre os boxes
 * - Inline warning quando PIN é trivial (exibido antes de submeter)
 *
 * Reusável em: change-pin/page.tsx, reset-pin/page.tsx
 */

import { useRef, useEffect } from 'react'
import { isBlockedPin } from '@/lib/security/blocked-pins'

interface PinInputProps {
  /** Valor atual (string de até 4 chars) */
  value: string
  onChange: (value: string) => void
  label: string
  disabled?: boolean
  /** Se true, foca o primeiro input ao montar */
  autoFocus?: boolean
  /** Mostra warning de PIN trivial inline */
  showTrivialWarning?: boolean
}

export function PinInput({
  value,
  onChange,
  label,
  disabled = false,
  autoFocus = false,
  showTrivialWarning = false,
}: PinInputProps) {
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ] as const

  // Auto-foco no primeiro input ao montar (se solicitado)
  useEffect(() => {
    if (autoFocus) {
      inputRefs[0].current?.focus()
    }
  }, [autoFocus]) // eslint-disable-line react-hooks/exhaustive-deps

  const digits = value.padEnd(4, '').split('').slice(0, 4)

  function handleInput(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1) // mantém apenas último dígito
    const newDigits = [...digits]
    newDigits[index] = digit

    // Remove dígitos extras além do index (evita salto de campo)
    const newValue = newDigits.join('').slice(0, 4)
    onChange(newValue)

    // Avança foco se digitou um dígito e não é o último
    if (digit && index < 3) {
      inputRefs[index + 1].current?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!digits[index]) {
        // Campo atual vazio: volta para o anterior
        if (index > 0) {
          e.preventDefault()
          inputRefs[index - 1].current?.focus()
          // Limpa o campo anterior
          const newDigits = [...digits]
          newDigits[index - 1] = ''
          onChange(newDigits.join('').slice(0, 4))
        }
      } else {
        // Limpa o campo atual
        const newDigits = [...digits]
        newDigits[index] = ''
        onChange(newDigits.join('').slice(0, 4))
      }
    }

    // Seta → avança foco sem digitar
    if (e.key === 'ArrowRight' && index < 3) {
      inputRefs[index + 1].current?.focus()
    }
    // Seta ← volta foco
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (pasted) {
      onChange(pasted)
      // Foca no box correspondente ao último dígito colado
      const focusIndex = Math.min(pasted.length - 1, 3)
      inputRefs[focusIndex].current?.focus()
    }
  }

  // Warning de PIN trivial (apenas se completo e trivial)
  const isTrivial = showTrivialWarning && value.length === 4 && isBlockedPin(value)

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>

      {/* 4 boxes de dígito */}
      <div className="flex gap-3" role="group" aria-label={label}>
        {([0, 1, 2, 3] as const).map(i => (
          <input
            key={i}
            ref={inputRefs[i]}
            type="password"
            inputMode="numeric"
            pattern="[0-9]"
            maxLength={1}
            value={digits[i] ?? ''}
            onChange={e => handleInput(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            disabled={disabled}
            aria-label={`Dígito ${i + 1} de 4 do ${label}`}
            aria-invalid={isTrivial}
            className={`h-14 w-14 rounded-2xl border-2 text-center text-2xl font-bold transition
              focus:outline-none focus:ring-2
              ${disabled
                ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300'
                : isTrivial
                  ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-200'
                  : digits[i]
                    ? 'border-rose-400 bg-rose-50 text-rose-700 focus:ring-rose-200'
                    : 'border-gray-300 bg-white text-gray-800 focus:border-rose-400 focus:ring-rose-200'
              }`}
          />
        ))}
      </div>

      {/* Warning inline de PIN trivial */}
      {isTrivial && (
        <p role="alert" className="text-xs text-red-600">
          ⚠️ Esse PIN é muito fácil de adivinhar. Escolha um diferente.
        </p>
      )}
    </div>
  )
}
