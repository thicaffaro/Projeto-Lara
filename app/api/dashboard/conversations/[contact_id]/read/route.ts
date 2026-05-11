/**
 * POST /api/dashboard/conversations/[contact_id]/read
 * Marca mensagens inbound não lidas como lidas.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: Promise<{ contact_id: string }> }

export async function POST(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { contact_id } = await params
  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  // Verifica que o contato pertence a esta profissional
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contact_id)
    .eq('professional_id', session.professionalId)
    .maybeSingle()

  if (!contact) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await supabase
    .from('messages')
    .update({ read_by_professional_at: new Date().toISOString() })
    .eq('contact_id', contact_id)
    .eq('direction', 'inbound')
    .is('read_by_professional_at', null)
    .gte('created_at', thirtyDaysAgo)

  return NextResponse.json({ ok: true })
}
