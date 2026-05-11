/**
 * POST /api/dashboard/lara/pause
 * Pausa ou retoma a Lara (professionals.is_paused).
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body   = await req.json().catch(() => ({})) as { paused?: boolean }
  const paused = body.paused ?? false

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('professionals')
    .update({ is_paused: paused })
    .eq('id', session.professionalId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_log').insert({
    professional_id: session.professionalId,
    actor: 'professional',
    action: paused ? 'lara_paused' : 'lara_resumed',
    new_data: { is_paused: paused },
  }).then(null, () => {})

  return NextResponse.json({ ok: true, is_paused: paused })
}
