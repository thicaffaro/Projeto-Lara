/**
 * POST /api/onboarding/reconnect
 * Re-executa o Embedded Signup para casos de token inválido (OAuthException code=190).
 *
 * DIFERENÇAS vs. exchange-token:
 *   - NÃO cria novo profissional — atualiza o existente (lookup por phone_number)
 *   - NÃO reseta trial, trial_started_at, trial_ends_at
 *   - NÃO cancela appointments existentes
 *   - Atualiza APENAS: access_token_encrypted, whatsapp_status, meta_waba_id,
 *     meta_phone_number_id, whatsapp_status_changed_at (via trigger)
 *
 * Requer: professionalId existente (obtido do dashboard).
 *
 * Fluxo completo de reconexão:
 *   1. Usuário acessa /dashboard/lara (banner de token inválido)
 *   2. Clica "Reconectar WhatsApp"
 *   3. EmbeddedSignupForm abre no modo 'reconnect'
 *   4. Após OAuth, chama este endpoint
 *   5. Continua com /register-number e /verify-code normalmente
 *
 * BILLING:
 *   Após reconexão bem-sucedida, tenta retomar cobrança MP via
 *   resumeBillingForProfessional (fire-and-forget — falha não bloqueia resposta).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/crypto'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  WhatsAppApiError,
} from '@/lib/whatsapp'
import { resumeBillingForProfessional } from '@/lib/billing/auto-resume'

interface ReconnectBody {
  code: string
  wabaId: string
  phoneNumberId: string
  professionalId: string
}

function validateBody(body: unknown): body is ReconnectBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.code === 'string' && b.code.length > 0 &&
    typeof b.wabaId === 'string' &&
    typeof b.phoneNumberId === 'string' &&
    typeof b.professionalId === 'string' && b.professionalId.length > 0
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!validateBody(body)) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  const { code, wabaId, phoneNumberId, professionalId } = body
  const supabase = createAdminClient()

  // Confirma que o profissional existe
  const { data: professional, error: fetchError } = await supabase
    .from('professionals')
    .select('id, whatsapp_status, trial_started_at, billing_paused_at')
    .eq('id', professionalId)
    .single()

  if (fetchError || !professional) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  // Troca code → token longo (NUNCA logar o token)
  let longLivedToken: string
  try {
    const { accessToken: shortToken } = await exchangeCodeForToken(code)
    longLivedToken = await exchangeForLongLivedToken(shortToken)
  } catch (err) {
    const msg = err instanceof WhatsAppApiError ? err.message : 'Falha ao autenticar com a Meta.'
    console.error('[reconnect] Falha OAuth — professional:', professionalId, 'msg:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Criptografa token
  let encryptedToken: Buffer
  try {
    encryptedToken = await encryptToken(longLivedToken)
  } catch {
    console.error('[reconnect] Falha na criptografia — professional:', professionalId)
    return NextResponse.json({ error: 'Falha ao proteger credenciais.' }, { status: 500 })
  } finally {
    ;(longLivedToken as any) = null
  }

  // Atualiza SOMENTE campos relacionados à conexão — trial e agenda intocados
  const { error: updateError } = await supabase
    .from('professionals')
    .update({
      access_token_encrypted: encryptedToken,
      whatsapp_status: 'connected',
      meta_waba_id: wabaId,
      meta_phone_number_id: phoneNumberId,
      // billing_paused_at será limpo quando MP retomar — não fazer aqui
    })
    .eq('id', professionalId)

  if (updateError) {
    console.error('[reconnect] Falha ao atualizar professional:', updateError.message)
    return NextResponse.json({ error: 'Falha ao salvar reconexão. Tente novamente.' }, { status: 500 })
  }

  console.log(`[reconnect] Reconexão bem-sucedida — professional: ${professionalId}`)

  // Tenta retomar cobrança MP de forma fire-and-forget.
  // Se a cobrança estava pausada (token_invalid > 7 dias), retoma agora.
  // Se a MP falhar, a resposta de reconexão NÃO é bloqueada — degradação graceful.
  resumeBillingForProfessional(professionalId).catch((e: Error) =>
    console.error('[reconnect] resumeBilling falhou (não-crítico):', e.message, 'professional:', professionalId)
  )

  return NextResponse.json({ ok: true, professionalId }, { status: 200 })
}
