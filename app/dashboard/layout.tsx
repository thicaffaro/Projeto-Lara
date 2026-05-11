/**
 * /app/dashboard/layout.tsx
 * Layout mobile do dashboard da profissional.
 * Header sticky + conteúdo rolável + bottom tab bar.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'
import { HeaderBar }    from '@/components/dashboard/HeaderBar'
import { BottomTabBar } from '@/components/dashboard/BottomTabBar'
import { MobileShell }  from '@/components/dashboard/MobileShell'
import { ToastProvider } from '@/components/ui/Toast'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Valida sessão
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value

  let professionalId: string | null = null

  if (sessionToken) {
    const session = await validateDashboardSession(sessionToken)
    if (session) professionalId = session.professionalId
  }

  if (!professionalId) {
    redirect('/auth/expired')
  }

  const supabase = createAdminClient()

  // Busca dados básicos da profissional
  const { data: raw } = await supabase
    .from('professionals')
    .select('name, whatsapp_status, whatsapp_status_changed_at')
    .eq('id', professionalId)
    .single()

  type ProfRow = {
    name: string
    whatsapp_status: 'connected' | 'token_invalid' | 'disconnected'
  }
  const prof = raw as unknown as ProfRow | null

  if (!prof) redirect('/auth/expired')

  // Conta conversas não respondidas para badge de notificação
  const { count: unreadCount } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', professionalId)
    .eq('direction', 'inbound')
    .is('read_by_professional_at', null)
    .not('lara_mode_decision', 'eq', 'responded')

  return (
    <ToastProvider>
      <MobileShell>
        <div className="flex h-dvh flex-col bg-gray-50">
          <HeaderBar
            professionalName={prof.name}
            whatsappStatus={prof.whatsapp_status}
          />
          <main className="flex-1 overflow-y-auto overscroll-contain">
            {children}
          </main>
          <BottomTabBar unreadCount={unreadCount ?? 0} />
        </div>
      </MobileShell>
    </ToastProvider>
  )
}
