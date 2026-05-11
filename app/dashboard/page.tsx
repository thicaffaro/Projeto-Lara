/**
 * /app/dashboard/page.tsx — Aba Início
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfDayInTz, endOfDayInTz, startOfWeekInTz, endOfWeekInTz } from '@/lib/timezone'
import { NotificationsBanner } from '@/components/dashboard/home/NotificationsBanner'
import { MetricsRow }          from '@/components/dashboard/home/MetricsRow'
import { TodaySchedule }       from '@/components/dashboard/home/TodaySchedule'
import { QuickActions }        from '@/components/dashboard/home/QuickActions'

export default async function DashboardHomePage() {
  const cookieStore = await cookies()
  const token       = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/auth/expired')

  const session = await validateDashboardSession(token)
  if (!session) redirect('/auth/expired')

  const { professionalId } = session
  const supabase = createAdminClient()

  // ── Dados da profissional ────────────────────────────────────────────────
  const { data: rawProf } = await supabase
    .from('professionals')
    .select('name, timezone, service_mode, is_paused, whatsapp_status, trial_started_at')
    .eq('id', professionalId)
    .single()

  type ProfRow = {
    name: string; timezone: string; service_mode: string
    is_paused: boolean; whatsapp_status: string; trial_started_at: string | null
  }
  const prof = rawProf as unknown as ProfRow | null
  if (!prof) redirect('/auth/expired')

  const tz  = prof.timezone ?? 'America/Sao_Paulo'
  const now = new Date()

  // ── Métricas ─────────────────────────────────────────────────────────────
  const [todayStart, todayEnd]   = [startOfDayInTz(now, tz), endOfDayInTz(now, tz)]
  const [weekStart,  weekEnd]    = [startOfWeekInTz(now, tz), endOfWeekInTz(now, tz)]

  const [{ count: todayCount }, { count: weekCount }, { data: noShowData }, { count: pending }] =
    await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId).eq('status', 'confirmed')
        .gte('starts_at', todayStart.toISOString()).lte('starts_at', todayEnd.toISOString()),

      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId).eq('status', 'confirmed')
        .gte('starts_at', weekStart.toISOString()).lte('starts_at', weekEnd.toISOString()),

      supabase.from('appointments').select('status')
        .eq('professional_id', professionalId)
        .gte('starts_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
        .lte('starts_at', now.toISOString()),

      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId).eq('direction', 'inbound')
        .is('read_by_professional_at', null).not('lara_mode_decision', 'eq', 'responded'),
    ])

  const totalMonth   = (noShowData ?? []).length
  const noShowCount  = (noShowData ?? []).filter((a: { status: string }) => a.status === 'no_show').length
  const noShowPct    = totalMonth > 0 ? Math.round((noShowCount / totalMonth) * 100) : 0

  // ── Sessões de hoje ───────────────────────────────────────────────────────
  const { data: rawAppts } = await supabase
    .from('appointments')
    .select('id, starts_at, protocol_name, status, contact_id, contacts(name, phone_number, address)')
    .eq('professional_id', professionalId)
    .gte('starts_at', todayStart.toISOString())
    .lte('starts_at', todayEnd.toISOString())
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true })

  type ApptRow = {
    id: string; starts_at: string; protocol_name: string; status: string
    contacts: { name: string | null; phone_number: string; address: Record<string, string> | null } | null
  }
  const appointments = ((rawAppts ?? []) as unknown as ApptRow[]).map(a => ({
    id:            a.id,
    starts_at:     a.starts_at,
    protocol_name: a.protocol_name,
    contact_name:  a.contacts?.name ?? null,
    contact_phone: a.contacts?.phone_number ?? '',
    status:        a.status,
    neighborhood:  a.contacts?.address?.neighborhood ?? null,
  }))

  // ── Alertas ───────────────────────────────────────────────────────────────
  type Alert = { id: string; level: 'red' | 'orange' | 'yellow' | 'blue'; message: string; href?: string }
  const alerts: Alert[] = []

  if (prof.whatsapp_status === 'token_invalid') {
    alerts.push({ id: 'token', level: 'red', message: 'Conexão WhatsApp expirou — toque para reconectar', href: '/dashboard/lara' })
  }
  if (prof.whatsapp_status === 'trial_pending_templates') {
    alerts.push({ id: 'trial', level: 'blue', message: 'Templates em análise pela Meta (até 24h). Configure sua Lara enquanto isso!' })
  }
  if ((pending ?? 0) > 0) {
    alerts.push({ id: 'pending', level: 'orange', message: `${pending} mensagem(ns) aguardando sua resposta`, href: '/dashboard/conversations?filter=pending' })
  }

  return (
    <div className="pb-4">
      <NotificationsBanner alerts={alerts} />

      <div className="px-4 pt-4 pb-1">
        <h1 className="text-base font-semibold text-gray-700">Olá, {prof.name.split(' ')[0]}! 👋</h1>
      </div>

      <MetricsRow metrics={{
        todayCount:    todayCount ?? 0,
        weekCount:     weekCount  ?? 0,
        noShowPct,
        pendingReplies: pending   ?? 0,
      }} />

      <div className="px-4 pb-2">
        <h2 className="text-sm font-semibold text-gray-700">Sessões de hoje</h2>
      </div>

      <TodaySchedule appointments={appointments} timezone={tz} />

      <div className="px-4 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-gray-700">Ações rápidas</h2>
      </div>

      <QuickActions professionalId={professionalId} isPaused={prof.is_paused} />
    </div>
  )
}
