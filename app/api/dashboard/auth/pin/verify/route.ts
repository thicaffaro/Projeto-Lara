/**
 * POST /api/dashboard/auth/pin/verify
 * Verifica PIN e cria sessão se correto.
 * Lock: 5 erros → 15min bloqueado.
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDashboardSession, getSessionCookieOptions } from '@/lib/auth/dashboardSession'

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { professional_id, pin } = body

  if (!professional_id || typeof pin !== 'string') {
    return NextResponse.json({ error: 'professional_id e pin obrigatórios' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: raw } = await supabase
    .from('professionals')
    .select('pin_hash, pin_attempts, pin_locked_until')
    .eq('id', professional_id as string)
    .single()

  type PinRow = { pin_hash: string | null; pin_attempts: number; pin_locked_until: string | null }
  const prof = raw as unknown as PinRow | null

  if (!prof?.pin_hash) {
    return NextResponse.json({ error: 'PIN não configurado' }, { status: 400 })
  }

  // Verifica bloqueio ativo
  if (prof.pin_locked_until && new Date(prof.pin_locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(prof.pin_locked_until).getTime() - Date.now()) / 60_000)
    return NextResponse.json({ error: 'blocked', locked: true, lock_minutes: minutes }, { status: 429 })
  }

  // Verifica PIN
  const isValid = await bcrypt.compare(pin, prof.pin_hash)

  if (!isValid) {
    const newAttempts = (prof.pin_attempts ?? 0) + 1
    const shouldLock  = newAttempts >= MAX_ATTEMPTS
    const lockedUntil = shouldLock
      ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
      : null

    await supabase
      .from('professionals')
      .update({ pin_attempts: newAttempts, pin_locked_until: lockedUntil })
      .eq('id', professional_id as string)

    if (shouldLock) {
      return NextResponse.json({ error: 'blocked', locked: true, lock_minutes: LOCK_MINUTES }, { status: 429 })
    }

    return NextResponse.json(
      { error: 'invalid_pin', remaining: MAX_ATTEMPTS - newAttempts },
      { status: 401 }
    )
  }

  // Sucesso — reset tentativas + cria sessão
  await supabase
    .from('professionals')
    .update({ pin_attempts: 0, pin_locked_until: null })
    .eq('id', professional_id as string)

  const sessionToken = await createDashboardSession(
    professional_id as string,
    req.headers.get('user-agent') ?? undefined,
  )

  const { name: cookieName, ...cookieOptions } = getSessionCookieOptions()
  const res = NextResponse.json({ ok: true }, { status: 200 })
  res.cookies.set(cookieName, sessionToken, cookieOptions)
  return res
}
