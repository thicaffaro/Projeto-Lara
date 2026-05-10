/**
 * GET /api/dashboard/security/whatsapp-status
 * Retorna status atual do WhatsApp para o componente de auto-refresh.
 * Chamado a cada 30s pelo SecurityWhatsAppStatus (client component).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('professionals')
    .select('whatsapp_status, whatsapp_status_changed_at')
    .eq('auth_user_id', user.id)
    .single()

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(
    {
      status:    (data as unknown as { whatsapp_status: string }).whatsapp_status,
      changedAt: (data as unknown as { whatsapp_status_changed_at: string | null }).whatsapp_status_changed_at,
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
