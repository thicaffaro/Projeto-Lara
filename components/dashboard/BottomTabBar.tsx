'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab {
  label: string
  icon: string
  href: string
  ariaLabel?: string
}

const TABS: Tab[] = [
  { label: 'Início',      icon: '🏠',  href: '/dashboard' },
  { label: 'Agenda',      icon: '📅',  href: '/dashboard/agenda' },
  { label: 'Conversas',   icon: '💬',  href: '/dashboard/conversations' },
  { label: 'Contatos',    icon: '👥',  href: '/dashboard/contacts' },
  { label: 'Lara',        icon: '⚙️',  href: '/dashboard/lara' },
]

interface Props {
  /** Count de conversas não respondidas para badge */
  unreadCount?: number
}

export function BottomTabBar({ unreadCount = 0 }: Props) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <nav
      aria-label="Navegação principal"
      className="sticky bottom-0 z-30 flex h-16 border-t border-gray-100 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(tab => {
        const active  = isActive(tab.href)
        const isChat  = tab.href === '/dashboard/conversations'
        const hasBadge = isChat && unreadCount > 0

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.ariaLabel ?? tab.label}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-1 min-h-[44px] flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
              active ? 'text-rose-500' : 'text-gray-400'
            }`}
          >
            {/* Ícone com badge */}
            <div className="relative">
              <span className="text-xl leading-none" aria-hidden="true">{tab.icon}</span>
              {hasBadge && (
                <span
                  aria-label={`${unreadCount} mensagens não respondidas`}
                  className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>

            {/* Label — sempre visível */}
            <span className={`text-[10px] font-medium leading-none ${active ? 'text-rose-500' : 'text-gray-400'}`}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
