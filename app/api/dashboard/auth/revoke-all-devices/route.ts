/**
 * POST /api/dashboard/auth/revoke-all-devices
 * Encerra todas as sessões ativas da profissional.
 *
 * Fluxo:
 * 1. Valida current_pin via bcrypt.compare
 * 2. supabase.auth.admin.signOut(userId, 'global') → invalida TODOS os tokens JWT
 * 3. Gera recovery_token para reset de PIN (a senha muda após o revoke)
 *    — nova senha aleatória para que a sessão atual não possa ser reutilizada
 * 4. Envia link de retorno via WhatsApp (LARA_OFFICIAL_PHONE → profissional)
 * 5. Audit log com event_type='all_devices_revoked'
 *
 * CONSIDERAÇÕES:
 * - Magic links existentes ainda funcionam (Supabase OTP não é revogado pelo signOut global)
 * - Profissional precisa de novo PIN para acessar o painel após o revoke
 * - Conexão WhatsApp e agendamentos NÃO são afetados
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

const BCRYPT_COST       = 12
const TOKEN_EXPIRY_SECS = 60 * 60 // 1 hora (mais generoso que reset de PIN)
const APP_URL           = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { current_pin } = (body ?? {}) as { current_pin?: string }

  if (!current_pin || !/^\d{4}$/.test(current_pin)) {
    return NextResponse.json({ error: 'PIN de 4 dígitos obrigatório' }, { status: 400 })
  }

  // ── Autentica sessão atual ─────────────────────────────────────────────────
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

  // ── Busca professional ────────────────────────────────────────────────────
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

  // ── Valida PIN atual ───────────────────────────────────────────────────────
  if (!professional.dashboard_pin_hash) {
    return NextResponse.json(
      { error: 'Nenhum PIN configurado. Configure um PIN primeiro.' },
      { status: 400 }
    )
  }

  const isValidPin = await bcrypt.compare(current_pin, professional.dashboard_pin_hash)
  if (!isValidPin) {
    return NextResponse.json({ error: 'PIN incorreto.' }, { status: 401 })
  }

  const professionalId = professional.id

  // ── 1. Invalida TODAS as sessões via signOut global ────────────────────────
  // Isso revoga todos os JWT access tokens e refresh tokens do usuário
  const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(
    user.id,
    'global'
  )

  if (signOutErr) {
    console.error('[revoke-devices] signOut global falhou:', signOutErr.message)
    return NextResponse.json(
      { error: 'Falha ao encerrar sessões. Tente novamente.' },
      { status: 500 }
    )
  }

  // ── 2. Gera recovery token para retorno ───────────────────────────────────
  // A profissional precisará deste link para criar um novo PIN após o revoke
  const recoveryToken = randomUUID()
  const expiresAt     = new Date(Date.now() + TOKEN_EXPIRY_SECS * 1000).toISOString()

  await supabaseAdmin.from('recovery_tokens').insert({
    professional_id: professionalId,
    channel: 'sms',
    token: recoveryToken,
    destination: professional.phone_number,
    purpose: 'reset_pin',
    expires_at: expiresAt,
  }).then(null, (e: Error) =>
    console.error('[revoke-devices] recovery_token INSERT falhou:', e.message)
  )

  const resetLink = `${APP_URL}/auth/reset-pin?token=${recoveryToken}`

  // ── 3. Audit log ──────────────────────────────────────────────────────────
  await supabaseAdmin.from('audit_log').insert({
    professional_id: professionalId,
    actor: 'professional',
    action: 'all_devices_revoked',
    new_data: {
      triggered_by: 'security_page',
      // sem PIN, sem tokens
    },
  }).then(null, (e: Error) =>
    console.error('[revoke-devices] audit_log falhou:', e.message)
  )

  // ── 4. Notificação WhatsApp com link de retorno ───────────────────────────
  sendFromOfficialNumber(
    professional.phone_number,
    `🔐 Todos os seus dispositivos foram desconectados a pedido.\n\nUse o link abaixo para criar um novo PIN e voltar a acessar o painel:\n${resetLink}\n\nO link expira em 1 hora. Se não foi você, fale com nosso suporte imediatamente.`,
  ).catch((e: Error) =>
    console.error('[revoke-devices] Notificação WhatsApp falhou:', e.message)
  )

  return NextResponse.json(
    {
      ok: true,
      message: 'Concluído. Verifique seu WhatsApp para o link de acesso.',
    },
    { status: 200 }
  )
}
