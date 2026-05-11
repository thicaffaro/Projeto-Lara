/**
 * PATCH /api/dashboard/contacts/[id]/lara-mode
 * Atualiza lara_mode de um contato.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { lara_mode?: string }
  const { lara_mode } = body

  if (!['full', 'booking_only', 'silent'].includes(lara_mode ?? '')) {
    return NextResponse.json({ error: 'lara_mode inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contacts')
    .update({ lara_mode: lara_mode as 'full' | 'booking_only' | 'silent' })
    .eq('id', id)
    .eq('professional_id', session.professionalId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
