/**
 * GET /api/auth/reset-pin/validate?token=XXX
 * Valida se um token de reset de PIN é utilizável.
 *
 * Retorna { valid: true } ou { valid: false, reason: string }
 * NÃO expõe professional_id na resposta.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token')

  if (!token || token.length < 10) {
    return NextResponse.json({ valid: false, reason: 'token_missing' })
  }

  const supabase = createAdminClient()

  const { data: raw } = await supabase
    .from('recovery_tokens')
    .select('id, expires_at, used_at, purpose')
    .eq('token', token)
    .maybeSingle()

  const record = raw as unknown as {
    id: string
    expires_at: string
    used_at: string | null
    purpose: string
  } | null

  if (!record) {
    return NextResponse.json({ valid: false, reason: 'token_not_found' })
  }

  if (record.purpose !== 'reset_pin') {
    return NextResponse.json({ valid: false, reason: 'invalid_purpose' })
  }

  if (record.used_at) {
    return NextResponse.json({ valid: false, reason: 'already_used' })
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' })
  }

  return NextResponse.json({ valid: true })
}
