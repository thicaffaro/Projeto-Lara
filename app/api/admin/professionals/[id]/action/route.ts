import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateMagicLink } from '@/lib/auth/magicLink'

interface Props { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props): Promise<NextResponse> {
  // Verifica que é admin (middleware já validou, mas double-check)
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'super_admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { action: string }
  const { action } = body
  const adminSupabase = createAdminClient()

  // Log de todas as ações admin
  const logAction = async (a: string, details?: Record<string, unknown>) => {
    await adminSupabase.from('admin_actions_log').insert({
      admin_user_id: user.id, professional_id: id, action: a,
      details: (details ?? {}) as import('@/lib/supabase/types').Json,
    }).then(null, () => {})
  }

  switch (action) {
    case 'send_magic_link': {
      const { data: prof } = await adminSupabase.from('professionals').select('id').eq('id', id).single()
      if (!prof) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      const { url } = await generateMagicLink(id, 'dashboard')
      await logAction('send_magic_link', { url })
      return NextResponse.json({ ok: true, url })
    }
    case 'reset_pin': {
      await adminSupabase.from('professionals').update({ pin_hash: null, pin_attempts: 0, pin_locked_until: null, dashboard_pin_hash: null }).eq('id', id)
      await logAction('reset_pin')
      return NextResponse.json({ ok: true })
    }
    case 'suspend': {
      await adminSupabase.from('professionals').update({ is_paused: true }).eq('id', id)
      await logAction('suspend')
      return NextResponse.json({ ok: true })
    }
    case 'reactivate': {
      await adminSupabase.from('professionals').update({ is_paused: false }).eq('id', id)
      await logAction('reactivate')
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
  }
}
