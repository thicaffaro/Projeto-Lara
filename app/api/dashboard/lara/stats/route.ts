/**
 * GET /api/dashboard/lara/stats
 * Estatísticas de uso da Lara para a aba Lara.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [
    { count: laraReplied },
    { count: silentCount },
    { data: modeCount },
  ] = await Promise.all([
    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', session.professionalId)
      .eq('sent_by', 'lara')
      .gte('created_at', monthStart),

    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', session.professionalId)
      .eq('direction', 'inbound')
      .like('lara_mode_decision', 'silent_%')
      .gte('created_at', monthStart),

    supabase.from('contacts')
      .select('lara_mode')
      .eq('professional_id', session.professionalId),
  ])

  // Count by lara_mode
  type ModeRow = { lara_mode: string }
  const byMode = ((modeCount ?? []) as unknown as ModeRow[]).reduce<Record<string, number>>((acc, c) => {
    acc[c.lara_mode] = (acc[c.lara_mode] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    laraReplied: laraReplied ?? 0,
    silentCount: silentCount ?? 0,
    contactsByMode: byMode,
  })
}
