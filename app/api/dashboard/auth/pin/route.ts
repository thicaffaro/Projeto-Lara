/**
 * POST /api/dashboard/auth/pin
 * Cria ou atualiza o PIN da profissional (bcrypt cost 12).
 * Chamado no setup-pin (primeiro acesso) e no change-pin (B3).
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDashboardSession, getSessionCookieOptions } from '@/lib/auth/dashboardSession'
import { validatePin } from '@/lib/security/blocked-pins'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { professional_id, new_pin } = body

  if (!professional_id || typeof new_pin !== 'string') {
    return NextResponse.json({ error: 'professional_id e new_pin obrigatórios' }, { status: 400 })
  }

  const pinError = validatePin(new_pin)
  if (pinError) return NextResponse.json({ error: pinError }, { status: 400 })

  const hash = await bcrypt.hash(new_pin, 12)
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('professionals')
    .update({ pin_hash: hash, pin_attempts: 0, pin_locked_until: null })
    .eq('id', professional_id as string)

  if (error) {
    console.error('[auth/pin] update error:', error.message)
    return NextResponse.json({ error: 'Falha ao salvar PIN.' }, { status: 500 })
  }

  // Cria sessão automaticamente após criar PIN
  const sessionToken = await createDashboardSession(
    professional_id as string,
    req.headers.get('user-agent') ?? undefined,
  )

  const { name: cookieName, ...cookieOptions } = getSessionCookieOptions()
  const res = NextResponse.json({ ok: true }, { status: 200 })
  res.cookies.set(cookieName, sessionToken, cookieOptions)
  return res
}
