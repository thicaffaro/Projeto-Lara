'use client'

/**
 * SecurityCard.tsx
 * Card reusável para seções da página /dashboard/lara/security.
 *
 * Layout: ícone à esquerda | título + descrição no centro | ação à direita
 * Mobile-first: em viewport < 640px, ação fica abaixo da descrição.
 */

interface SecurityCardProps {
  icon: string
  title: string
  description?: string
  /** Conteúdo customizado abaixo do título (substitui description se fornecido) */
  children?: React.ReactNode
  /** Botão ou ações à direita (desktop) / abaixo (mobile) */
  action?: React.ReactNode
  /** Cor de destaque do card: default | warning | danger | success */
  variant?: 'default' | 'warning' | 'danger' | 'success'
}

const VARIANT_STYLES = {
  default: 'border-gray-100 bg-white',
  warning: 'border-amber-200 bg-amber-50',
  danger:  'border-red-200  bg-red-50',
  success: 'border-green-200 bg-green-50',
} as const

const ICON_BG = {
  default: 'bg-gray-100',
  warning: 'bg-amber-100',
  danger:  'bg-red-100',
  success: 'bg-green-100',
} as const

export function SecurityCard({
  icon,
  title,
  description,
  children,
  action,
  variant = 'default',
}: SecurityCardProps) {
  return (
    <div className={`rounded-2xl border p-5 ${VARIANT_STYLES[variant]}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        {/* Ícone */}
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${ICON_BG[variant]}`}
          aria-hidden="true"
        >
          {icon}
        </div>

        {/* Conteúdo */}
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="text-sm leading-relaxed text-gray-500">{description}</p>
          )}
          {children}
        </div>

        {/* Ação — à direita em desktop, abaixo em mobile */}
        {action && (
          <div className="shrink-0 sm:self-start">{action}</div>
        )}
      </div>

      {/* Ação full-width em mobile quando não há ação lateral */}
      {action && (
        <div className="mt-4 sm:hidden">{/* espaço reservado se ação já renderizou acima */}</div>
      )}
    </div>
  )
}
