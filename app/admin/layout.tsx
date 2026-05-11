/**
 * /app/admin/layout.tsx
 * Layout do painel admin — sidebar 200px + header + conteúdo desktop.
 * Auth via Supabase JWT (middleware garante role=super_admin).
 *
 * force-dynamic: todas as páginas admin fazem queries ao banco e NÃO devem
 * ser pré-renderizadas estaticamente no build (causaria erro sem env vars).
 */

// Propaga force-dynamic para todas as rotas filhas do segment /admin
export const dynamic = 'force-dynamic'

import Link from 'next/link'

const NAV = [
  { href: '/admin',              label: '📊 Visão geral' },
  { href: '/admin/professionals', label: '👩 Profissionais' },
  { href: '/admin/revenue',       label: '💰 Receita' },
  { href: '/admin/ops',           label: '⚙️ Operação' },
  { href: '/admin/support',       label: '🆘 Suporte' },
  { href: '/admin/audit',         label: '📋 Auditoria' },
  { href: '/admin/settings',      label: '🔧 Configurações' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-5">
          <p className="text-lg font-bold text-rose-500">Lara</p>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Admin</p>
        </div>
        <nav className="py-2">
          {NAV.map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
          <div />
          <a href="/api/auth/signout" className="text-xs text-gray-400 hover:text-gray-600">Sair</a>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
