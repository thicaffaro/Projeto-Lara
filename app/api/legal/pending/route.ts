/**
 * GET /api/legal/pending
 * Retorna documentos legais pendentes de aceite pelo profissional autenticado.
 * Usado pelo LegalUpdateBanner no mount.
 * Cache: no-store (estado individual por profissional).
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkPendingAcceptance } from '@/lib/legal/check-pending-acceptance'

export async function GET(): Promise<NextResponse> {
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
  if (!user) {
    return NextResponse.json({ has_pending: false, pending_docs: [], any_write_blocked: false })
  }

  const supabaseAdmin = createAdminClient()

  const { data: rawProf } = await supabaseAdmin
    .from('professionals')
    .select('id, subscriptions(status)')
    .eq('auth_user_id', user.id)
    .single()

  const professional = rawProf as unknown as {
    id: string
    subscriptions: Array<{ status: string }>
  } | null

  // Não autenticado ou cancelado → sem pendências
  if (!professional) {
    return NextResponse.json({ has_pending: false, pending_docs: [], any_write_blocked: false })
  }

  const subStatus = professional.subscriptions?.[0]?.status
  if (subStatus === 'cancelled' || subStatus === 'cancelled_pending_anonymization') {
    return NextResponse.json({ has_pending: false, pending_docs: [], any_write_blocked: false })
  }

  const result = await checkPendingAcceptance(professional.id, supabaseAdmin)

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
