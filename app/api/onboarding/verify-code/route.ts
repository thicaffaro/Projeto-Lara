/**
 * POST /api/onboarding/verify-code
 * Etapa 6 do Embedded Signup — sub-fluxo em 2 ações:
 *
 * action='request_code':
 *   Solicita código de verificação à Meta por SMS ou ligação.
 *   Retorna { ok: true } — UI mostra input para o código.
 *
 * action='verify':
 *   Valida o código de 6 dígitos com a Meta.
 *   Em sucesso:
 *     - Cria subscription com status='trial_pending_templates'
 *     - trial_started_at fica NULL (iniciará após 4/6 templates aprovados)
 *     - Retorna { ok: true, redirectTo: '/onboarding/setup' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getProfessionalToken,
  requestVerificationCode,
  verifyPhoneCode,
  WhatsAppApiError,
} from '@/lib/whatsapp'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface RequestCodeBody {
  action: 'request_code'
  professionalId: string
  method: 'SMS' | 'VOICE'
}

interface VerifyBody {
  action: 'verify'
  professionalId: string
  code: string
}

type Body = RequestCodeBody | VerifyBody

function validateBody(body: unknown): body is Body {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>

  if (typeof b.professionalId !== 'string' || !b.professionalId) return false

  if (b.action === 'request_code') {
    return b.method === 'SMS' || b.method === 'VOICE'
  }
  if (b.action === 'verify') {
    return typeof b.code === 'string' && /^\d{6}$/.test(b.code)
  }
  return false
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!validateBody(body)) {
    return NextResponse.json(
      { error: 'Parâmetros inválidos. action deve ser "request_code" ou "verify".' },
      { status: 400 },
    )
  }

  const { professionalId } = body
  const supabase = createAdminClient()

  // Busca phone_number_id
  const { data: professional, error: fetchError } = await supabase
    .from('professionals')
    .select('meta_phone_number_id')
    .eq('id', professionalId)
    .single()

  if (fetchError || !professional?.meta_phone_number_id) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  // Decriptografa token — usar imediatamente
  let accessToken: string
  try {
    accessToken = await getProfessionalToken(professionalId)
  } catch {
    console.error('[verify-code] Falha ao obter token:', professionalId)
    return NextResponse.json({ error: 'Falha de autenticação. Reconecte o WhatsApp.' }, { status: 500 })
  }

  try {
    // ── action: request_code ────────────────────────────────────────────────
    if (body.action === 'request_code') {
      await requestVerificationCode(
        professional.meta_phone_number_id,
        accessToken,
        body.method,
        professionalId,
      )
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // ── action: verify ──────────────────────────────────────────────────────
    await verifyPhoneCode(
      professional.meta_phone_number_id,
      accessToken,
      body.code,
      professionalId,
    )

    // Cria subscription com status 'trial_pending_templates'
    // trial_started_at fica NULL — iniciará quando 4/6 templates forem aprovados
    const { error: subError } = await supabase
      .from('subscriptions')
      .upsert(
        {
          professional_id: professionalId,
          status: 'trial_pending_templates',
        },
        { onConflict: 'professional_id' },
      )

    if (subError) {
      console.error('[verify-code] Falha ao criar subscription:', subError.message, 'professional:', professionalId)
      // Não bloqueia o fluxo — retorna sucesso mas loga o erro
    }

    return NextResponse.json(
      { ok: true, redirectTo: '/onboarding/setup' },
      { status: 200 },
    )

  } catch (err) {
    const msg = err instanceof WhatsAppApiError ? err.message : 'Falha na verificação'
    console.error('[verify-code] Erro:', msg, 'professional:', professionalId)
    return NextResponse.json({ error: msg }, { status: 502 })
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(accessToken as any) = null
  }
}
