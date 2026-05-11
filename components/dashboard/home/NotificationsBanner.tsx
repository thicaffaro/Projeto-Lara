'use client'

import Link from 'next/link'

interface Alert {
  id: string
  level: 'red' | 'orange' | 'yellow' | 'blue'
  message: string
  href?: string
}

interface Props {
  alerts: Alert[]
}

const LEVEL_STYLES: Record<Alert['level'], { bg: string; text: string; icon: string }> = {
  red:    { bg: 'bg-red-50 border-red-200',     text: 'text-red-800',    icon: '🔴' },
  orange: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-800', icon: '🟠' },
  yellow: { bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-800',  icon: '🟡' },
  blue:   { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-800',   icon: '🔵' },
}

export function NotificationsBanner({ alerts }: Props) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2 px-4 pt-3">
      {alerts.map(alert => {
        const s = LEVEL_STYLES[alert.level]
        const content = (
          <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${s.bg}`}>
            <span aria-hidden="true" className="shrink-0 text-base">{s.icon}</span>
            <p className={`text-sm font-medium ${s.text}`}>{alert.message}</p>
            {alert.href && <span className={`ml-auto shrink-0 text-xs font-medium ${s.text}`}>→</span>}
          </div>
        )

        return alert.href ? (
          <Link key={alert.id} href={alert.href} className="block active:opacity-80">
            {content}
          </Link>
        ) : (
          <div key={alert.id}>{content}</div>
        )
      })}
    </div>
  )
}
