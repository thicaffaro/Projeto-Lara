/**
 * POST /api/dashboard/auth/change-pin
 *
 * Recebe: { current_pin?: string, new_pin: string }
 * - current_pin é opcional apenas quando dashboard_pin_hash é NULL (primeiro PIN)
 *
 * Fluxo:
 * 1. Autentica via Supabase Auth
 * 2. Verifica rate limit (3 falhas em 15min → bloqueio 1h)
 * 3. Valida formato e trivialidade do new_pin
 * 4. Compara current_pin com bcrypt (se PIN existente)
 * 5. Hash new_pin com bcrypt cost 12
 * 6. UPDATE professionals.dashboard_pin_hash
 * 7. Audit log (SEM o PIN em texto plano)
 * 8. Notificação WhatsApp via número oficial Lara
 *
 * SEGURANÇA:
 * - PIN nunca aparece em logs, respostas de erro ou audit log
 * - bcrypt cost 12 (lento por design — ~250ms, resistente a força bruta)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePin } from '@/lib/security/blocked-pins'
import {
  checkPinRateLimit,
  recordFailedPinAttempt,
  clearPinAttempts,
} from '@/lib/security/pin-rate-limit'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

const BCRYPT_COST = 12

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { current_pin, new_pin } = (body ?? {}) as {
    current_pin?: string
    new_pin?: string
  }

  if (!new_pin) {
    return NextResponse.json({ error: 'new_pin obrigatório' }, { status: 400 })
  }

  // ── Autenticação ──────────────────────────────────────────────────────────
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

  const supabaseAdmin = createAdminClient()

  const { data: rawProf } = await supabaseAdmin
    .from('professionals')
    .select('id, phone_number, dashboard_pin_hash')
    .eq('auth_user_id', user.id)
    .single()

  const professional = rawProf as unknown as {
    id: string
    phone_number: string
    dashboard_pin_hash: string | null
  } | null

  if (!professional) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  const professionalId   = professional.id
  const existingPinHash  = professional.dashboard_pin_hash

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateStatus = await checkPinRateLimit(professionalId)
  if (rateStatus.blocked) {
    const minutes = rateStatus.ttlSeconds ? Math.ceil(rateStatus.ttlSeconds / 60) : 60
    return NextResponse.json(
      {
        error: 'blocked',
        message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minuto(s) ou use "Esqueci meu PIN".`,
        ttlMinutes: minutes,
      },
      { status: 429 }
    )
  }

  // ── Validação do new_pin ──────────────────────────────────────────────────
  const pinError = validatePin(new_pin)
  if (pinError) {
    return NextResponse.json({ error: pinError }, { status: 400 })
  }

  // ── Validação do current_pin (se PIN existente) ───────────────────────────
  if (existingPinHash) {
    if (!current_pin) {
      return NextResponse.json({ error: 'current_pin obrigatório' }, { status: 400 })
    }

    const isValid = await bcrypt.compare(current_pin, existingPinHash)
    if (!isValid) {
      const nowBlocked = await recordFailedPinAttempt(professionalId)
      const rateAfter  = await checkPinRateLimit(professionalId)

      if (nowBlocked) {
        return NextResponse.json(
          {
            error: 'blocked',
            message: 'Muitas tentativas incorretas. Conta bloqueada por 1 hora. Use "Esqueci meu PIN".',
          },
          { status: 429 }
        )
      }

      return NextResponse.json(
        {
          error: 'invalid_current_pin',
          // Não revelar quantas tentativas restam se for inseguro
          remaining: rateAfter.remaining,
        },
        { status: 401 }
      )
    }
  }

  // PIN atual correto (ou primeira criação) — limpa tentativas
  await clearPinAttempts(professionalId)

  // ── Hash do new_pin com bcrypt cost 12 ────────────────────────────────────
  // Cost 12 ≈ 250ms — lento intencionalmente para resistir a força bruta
  const newHash = await bcrypt.hash(new_pin, BCRYPT_COST)

  // ── Atualiza dashboard_pin_hash ───────────────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('professionals')
    .update({ dashboard_pin_hash: newHash })
    .eq('id', professionalId)

  if (updateErr) {
    console.error('[change-pin] Falha ao atualizar hash:', updateErr.message, 'professional:', professionalId)
    return NextResponse.json({ error: 'Falha ao salvar. Tente novamente.' }, { status: 500 })
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  // CRÍTICO: PIN nunca aparece em logs. Apenas metadados do evento.
  await supabaseAdmin.from('audit_log').insert({
    professional_id: professionalId,
    actor: 'professional',
    action: 'pin_changed',
    new_data: {
      first_time: !existingPinHash,
      // sem PIN, sem hash — apenas o fato do evento
    },
  }).then(null, (e: Error) =>
    console.error('[change-pin] audit_log falhou:', e.message)
  )

  // ── Notificação WhatsApp ──────────────────────────────────────────────────
  sendFromOfficialNumber(
    professional.phone_number,
    `🔐 Seu PIN foi alterado com sucesso. Se não foi você, acesse ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/lara/security imediatamente.`,
  ).catch((e: Error) =>
    console.error('[change-pin] Notificação WhatsApp falhou:', e.message)
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}
