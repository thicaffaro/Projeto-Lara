/**
 * GET /api/dashboard/agenda/appointments
 * Retorna appointments para o CalendarWeekView.
 * Autenticado via dashboard_session cookie.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { professionalId } = session
  const supabase = createAdminClient()

  // Busca faixa de datas da query (opcionais)
  const url       = new URL(req.url)
  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')

  // Padrão: 4 semanas ao redor de hoje
  const from = fromParam ?? new Date(Date.now() - 14 * 86_400_000).toISOString()
  const to   = toParam   ?? new Date(Date.now() + 14 * 86_400_000).toISOString()

  const { data: rawProf } = await supabase
    .from('professionals')
    .select('timezone')
    .eq('id', professionalId)
    .single()

  const timezone = (rawProf as unknown as { timezone: string } | null)?.timezone ?? 'America/Sao_Paulo'

  const { data: rawAppts } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, ends_at, protocol_name, status, service_location,
      contact_id,
      contacts(name, phone_number, address)
    `)
    .eq('professional_id', professionalId)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true })

  type ApptRow = {
    id: string; starts_at: string; ends_at: string; protocol_name: string
    status: string; service_location: string; contact_id: string
    contacts: { name: string | null; phone_number: string; address: Record<string, string> | null } | null
  }

  const appointments = ((rawAppts ?? []) as unknown as ApptRow[]).map(a => ({
    id:             a.id,
    starts_at:      a.starts_at,
    ends_at:        a.ends_at,
    protocol_name:  a.protocol_name,
    status:         a.status,
    service_location: a.service_location,
    contact_id:     a.contact_id,
    contact_name:   a.contacts?.name ?? null,
    contact_phone:  a.contacts?.phone_number ?? '',
    address:        a.contacts?.address
      ? Object.values(a.contacts.address as Record<string, string>).filter(Boolean).join(', ')
      : null,
  }))

  return NextResponse.json({ appointments, professionalId, timezone })
}
