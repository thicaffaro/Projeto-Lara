/**
 * POST   — assumir conversa (cria handover ativo)
 * DELETE — devolver para Lara (resolve handover ativo)
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: contact_id } = await params
  const supabase = createAdminClient()

  await supabase.from('human_handovers').insert({
    contact_id,
    professional_id: session.professionalId,
    status:  'active',
    context: { reason: 'professional_took_over_from_dashboard' },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: contact_id } = await params
  const supabase = createAdminClient()

  await supabase
    .from('human_handovers')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('contact_id', contact_id)
    .eq('professional_id', session.professionalId)
    .eq('status', 'active')

  return NextResponse.json({ ok: true })
}
