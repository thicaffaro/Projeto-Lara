'use client'

interface HeaderBarProps {
  professionalName: string
  whatsappStatus: 'connected' | 'token_invalid' | 'disconnected'
}

export function HeaderBar({ professionalName, whatsappStatus }: HeaderBarProps) {
  const statusIcon = whatsappStatus === 'connected' ? '🟢' : '🔴'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-white px-4">
      <span className="text-base font-bold text-rose-500">Lara</span>

      <span className="max-w-[160px] truncate text-sm font-medium text-gray-700">
        {professionalName}
      </span>

      <button
        aria-label={`Status WhatsApp: ${whatsappStatus}`}
        className="flex h-9 w-9 items-center justify-center rounded-full"
      >
        <span className="text-lg" aria-hidden="true">{statusIcon}</span>
      </button>
    </header>
  )
}
