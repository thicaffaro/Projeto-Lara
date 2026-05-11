/**
 * GET /api/dashboard/templates?professionalId=...
 * Retorna templates aprovados para o TemplatePicker.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'
import { LARA_TEMPLATES } from '@/lib/templates'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: approved } = await supabase
    .from('templates')
    .select('id, name, variant, status')
    .eq('professional_id', session.professionalId)
    .eq('status', 'approved')
    .order('name').order('variant')

  type TemplateRow = { id: string; name: string; variant: string; status: string }
  const templates = ((approved ?? []) as unknown as TemplateRow[]).map(t => {
    // Enriquece com o body do catálogo
    const def = LARA_TEMPLATES.find(d => d.name === t.name && d.variant === t.variant)
    return { ...t, body: def?.body ?? null }
  })

  return NextResponse.json({ templates })
}
