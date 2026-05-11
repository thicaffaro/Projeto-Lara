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

  const supabase = createAdminClient()
  const date = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const { data: rawProf } = await supabase
    .from('professionals')
    .select('service_mode, timezone')
    .eq('id', session.professionalId)
    .single()

  type ProfRow = { service_mode: string; timezone: string }
  const prof = rawProf as unknown as ProfRow | null
  const isHome = prof?.service_mode === 'home'

  if (!isHome) return NextResponse.json({ is_home: false, appointments: [] })

  const tz = prof?.timezone ?? 'America/Sao_Paulo'
  const dayStart = `${date}T00:00:00`
  const dayEnd   = `${date}T23:59:59`

  const { data: rawAppts } = await supabase
    .from('appointments')
    .select('id, protocol_name, starts_at, ends_at, status, contact_id, contacts(name, address, preferred_neighborhood)')
    .eq('professional_id', session.professionalId)
    .eq('status', 'confirmed')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .order('starts_at', { ascending: true })

  type ApptRow = {
    id: string; protocol_name: string; starts_at: string; status: string
    contacts: { name: string | null; address: Record<string, string> | null; preferred_neighborhood: string | null } | null
  }

  const appointments = ((rawAppts ?? []) as unknown as ApptRow[]).map(a => ({
    id: a.id,
    protocol_name: a.protocol_name,
    starts_at: a.starts_at,
    status: a.status,
    contact_name: a.contacts?.name ?? null,
    neighborhood: a.contacts?.preferred_neighborhood ?? a.contacts?.address?.neighborhood ?? null,
    contact_address: a.contacts?.address
      ? Object.values(a.contacts.address as Record<string, string>).filter(Boolean).join(', ')
      : null,
  }))

  return NextResponse.json({ is_home: true, appointments, timezone: tz })
}
