/**
 * POST /api/auth/reset-pin
 * Usa token de recuperação para definir novo PIN.
 *
 * Fluxo:
 * 1. Valida token (existe, não usado, não expirado, purpose='reset_pin')
 * 2. Valida e hasha new_pin (bcrypt cost 12, mesmas regras do change-pin)
 * 3. UPDATE professionals.dashboard_pin_hash
 * 4. UPDATE recovery_tokens SET used_at = NOW()
 * 5. clearPinAttempts — limpa contador de tentativas
 * 6. Audit log (sem PIN em texto plano)
 * 7. Notificação WhatsApp
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePin } from '@/lib/security/blocked-pins'
import { clearPinAttempts } from '@/lib/security/pin-rate-limit'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

const BCRYPT_COST = 12

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { token, new_pin } = (body ?? {}) as { token?: string; new_pin?: string }

  if (!token || !new_pin) {
    return NextResponse.json({ error: 'token e new_pin obrigatórios' }, { status: 400 })
  }

  // ── Validação do new_pin ──────────────────────────────────────────────────
  const pinError = validatePin(new_pin)
  if (pinError) {
    return NextResponse.json({ error: pinError }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── Busca e valida token ──────────────────────────────────────────────────
  const { data: rawToken } = await supabase
    .from('recovery_tokens')
    .select('id, professional_id, expires_at, used_at, purpose')
    .eq('token', token)
    .maybeSingle()

  const tokenRecord = rawToken as unknown as {
    id: string
    professional_id: string
    expires_at: string
    used_at: string | null
    purpose: string
  } | null

  if (!tokenRecord) {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 404 })
  }
  if (tokenRecord.purpose !== 'reset_pin') {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 })
  }
  if (tokenRecord.used_at) {
    return NextResponse.json({ error: 'Este link já foi utilizado.' }, { status: 410 })
  }
  if (new Date(tokenRecord.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Este link expirou. Solicite um novo.' }, { status: 410 })
  }

  const professionalId = tokenRecord.professional_id

  // ── Busca professional para notificação ───────────────────────────────────
  const { data: rawProf } = await supabase
    .from('professionals')
    .select('phone_number')
    .eq('id', professionalId)
    .single()

  const professional = rawProf as unknown as { phone_number: string } | null

  // ── Hash do new_pin ───────────────────────────────────────────────────────
  const newHash = await bcrypt.hash(new_pin, BCRYPT_COST)

  // ── Atualiza PIN ──────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('professionals')
    .update({ dashboard_pin_hash: newHash })
    .eq('id', professionalId)

  if (updateErr) {
    console.error('[reset-pin] Falha ao atualizar hash:', updateErr.message)
    return NextResponse.json({ error: 'Falha ao salvar. Tente novamente.' }, { status: 500 })
  }

  // ── Marca token como usado (consumo único) ────────────────────────────────
  await supabase
    .from('recovery_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenRecord.id)

  // ── Limpa tentativas — boa higiene (mesmo padrão da Tarefa 2) ─────────────
  await clearPinAttempts(professionalId)

  // ── Audit log ─────────────────────────────────────────────────────────────
  await supabase.from('audit_log').insert({
    professional_id: professionalId,
    actor: 'system',
    action: 'pin_reset_via_token',
    new_data: {
      channel: 'recovery_token',
      // sem PIN, sem hash
    },
  }).then(null, (e: Error) =>
    console.error('[reset-pin] audit_log falhou:', e.message)
  )

  // ── Notificação WhatsApp ──────────────────────────────────────────────────
  if (professional) {
    sendFromOfficialNumber(
      professional.phone_number,
      `🔐 Seu PIN foi resetado com sucesso. Se não foi você, acesse ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/lara/security imediatamente.`,
    ).catch((e: Error) =>
      console.error('[reset-pin] Notificação WhatsApp falhou:', e.message)
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
