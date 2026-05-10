/**
 * POST /api/onboarding/exchange-token
 * Etapa 4 do Embedded Signup.
 *
 * Recebe:
 *   - code: authorization code do OAuth Meta
 *   - wabaId: WABA ID (de sessionInfo)
 *   - phoneNumberId: Phone Number ID (de sessionInfo)
 *   - name: nome da profissional
 *   - phoneNumber: número de telefone (apenas dígitos)
 *   - cpfOrCnpj: CPF ou CNPJ (apenas dígitos)
 *
 * Faz:
 *   1. Troca code por access_token curto → long-lived via Graph API
 *   2. Criptografa token via encrypt_access_token do banco (NUNCA logar plaintext)
 *   3. Cria registro em professionals (UPSERT por phone_number)
 *   4. Cria usuário no Supabase Auth (email derivado: phone@laraassistente.local)
 *   5. Vincula auth_user_id ao professional
 *
 * Retorna: { professionalId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/crypto'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  WhatsAppApiError,
} from '@/lib/whatsapp'

// ── Schema de entrada ─────────────────────────────────────────────────────────

interface ExchangeTokenBody {
  code: string
  wabaId: string
  phoneNumberId: string
  name: string
  phoneNumber: string
  cpfOrCnpj: string
}

function validateBody(body: unknown): body is ExchangeTokenBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.code === 'string' && b.code.length > 0 &&
    typeof b.wabaId === 'string' &&
    typeof b.phoneNumberId === 'string' &&
    typeof b.name === 'string' && b.name.length > 0 &&
    typeof b.phoneNumber === 'string' && b.phoneNumber.length >= 10 &&
    typeof b.cpfOrCnpj === 'string' && b.cpfOrCnpj.length >= 11
  )
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
    return NextResponse.json({ error: 'Campos obrigatórios ausentes ou inválidos' }, { status: 400 })
  }

  const { code, wabaId, phoneNumberId, name, phoneNumber, cpfOrCnpj } = body

  // ── 1. Troca code → token curto → token longo ─────────────────────────────
  // NUNCA logar o code, shortToken ou longToken
  let longLivedToken: string
  try {
    const { accessToken: shortToken } = await exchangeCodeForToken(code)
    longLivedToken = await exchangeForLongLivedToken(shortToken)
  } catch (err) {
    // Sanitiza: aceita apenas mensagem de WhatsAppApiError (já sanitizada em /lib/whatsapp.ts)
    // Se err for outro tipo, usa mensagem genérica — garante que nenhum body de resposta
    // da Graph API (que pode conter token em casos de bug da Meta) vaze para logs.
    const msg = err instanceof WhatsAppApiError
      ? err.message
      : 'Falha ao autenticar com a Meta. Tente novamente.'
    // Log: contém apenas msg sanitizada — sem code, sem token, sem body de resposta
    console.error('[exchange-token] Falha OAuth — professional phone redacted, msg:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // ── 2. Criptografar token ─────────────────────────────────────────────────
  // longLivedToken NÃO aparece em nenhum log a partir daqui
  let encryptedToken: Buffer
  try {
    encryptedToken = await encryptToken(longLivedToken)
  } catch {
    console.error('[exchange-token] Falha na criptografia do token')
    return NextResponse.json({ error: 'Falha ao proteger credenciais. Tente novamente.' }, { status: 500 })
  } finally {
    // Zerar variável — JS não garante coleta imediata mas documenta a intenção
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(longLivedToken as any) = null
  }

  const supabase = createAdminClient()

  // ── 3. Upsert professional ────────────────────────────────────────────────
  const { data: professional, error: upsertError } = await supabase
    .from('professionals')
    .upsert(
      {
        name,
        phone_number: phoneNumber,
        cpf_or_cnpj: cpfOrCnpj,
        meta_waba_id: wabaId,
        meta_phone_number_id: phoneNumberId,
        access_token_encrypted: encryptedToken,
        whatsapp_status: 'connected',
      },
      { onConflict: 'phone_number', ignoreDuplicates: false },
    )
    .select('id, phone_number, auth_user_id')
    .single()

  if (upsertError || !professional) {
    console.error('[exchange-token] Upsert professionals falhou:', upsertError?.message)
    return NextResponse.json({ error: 'Falha ao salvar dados. Tente novamente.' }, { status: 500 })
  }

  const professionalId: string = professional.id

  // ── 4. Criar usuário Supabase Auth (se ainda não existe) ──────────────────
  // Email derivado: phone_number@laraassistente.local
  // Ver /docs/auth.md para justificativa e limitações
  if (!professional.auth_user_id) {
    const derivedEmail = `${phoneNumber}@laraassistente.local`

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: derivedEmail,
      email_confirm: true,
      user_metadata: {
        professional_id: professionalId,
        name,
        phone_number: phoneNumber,
      },
    })

    if (authError) {
      // Se já existe (usuário reconectando), buscar pelo email
      if (authError.message.toLowerCase().includes('already')) {
        const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
        const existing = list?.users.find(u => u.email === derivedEmail)
        if (existing) {
          await supabase
            .from('professionals')
            .update({ auth_user_id: existing.id })
            .eq('id', professionalId)
        }
      } else {
        console.error('[exchange-token] createUser falhou:', authError.message)
        return NextResponse.json({ error: 'Falha ao criar conta. Contate o suporte.' }, { status: 500 })
      }
    } else if (authData.user) {
      // ── 5. Vincular auth_user_id ─────────────────────────────────────────
      await supabase
        .from('professionals')
        .update({ auth_user_id: authData.user.id })
        .eq('id', professionalId)
    }
  }

  return NextResponse.json({ professionalId }, { status: 200 })
}
