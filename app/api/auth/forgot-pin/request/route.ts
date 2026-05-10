/**
 * POST /api/auth/forgot-pin/request
 * Gera token de recuperação de PIN e envia via SMS ou email.
 *
 * SEMPRE retorna 200 — não vaza se a conta existe ou não.
 *
 * Anti-abuse: se houver token 'reset_pin' criado nos últimos 5min
 * para o mesmo phone_number (usado_at IS NULL), não reenvia.
 *
 * Token: UUID v4, expires_at = NOW() + 30min, purpose='reset_pin'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripMask } from '@/lib/validation'
import { sendSms } from '@/lib/sms/twilio'
import { sendEmail, buildEmailHtml } from '@/lib/email/resend'
import { randomUUID } from 'crypto'

const SILENT_OK = NextResponse.json({ ok: true }, { status: 200 })
const APP_URL   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() }
  catch { return SILENT_OK }

  const { phone_number: rawPhone, channel } = (body ?? {}) as {
    phone_number?: string
    channel?: string
  }

  if (!rawPhone || (channel !== 'sms' && channel !== 'email')) {
    return SILENT_OK // retorna 200 silencioso — não revela erro
  }

  const phone    = stripMask(rawPhone)
  const supabase = createAdminClient()

  // ── Busca professional pelo phone_number ──────────────────────────────────
  const { data: raw } = await supabase
    .from('professionals')
    .select('id, phone_number, recovery_email')
    .or(`phone_number.eq.${phone},phone_number.eq.55${phone}`)
    .maybeSingle()

  const professional = raw as unknown as {
    id: string
    phone_number: string
    recovery_email: string | null
  } | null

  // Conta não existe → retorna 200 silencioso (não vaza existência)
  // Audit log da tentativa — útil para detectar enumeração de phones
  if (!professional) {
    await supabase.from('audit_log').insert({
      professional_id: null,
      actor: 'anonymous',
      action: 'forgot_pin_request_unknown_phone',
      new_data: {
        // Não logar o phone completo — apenas últimos 4 dígitos para rastreamento
        phone_suffix: phone.slice(-4),
        channel,
      },
    }).then(null, (e: Error) =>
      console.error('[forgot-pin/request] audit_log unknown_phone falhou:', e.message)
    )
    return SILENT_OK
  }

  // Canal 'email' sem recovery_email → retorna 200 silencioso
  if (channel === 'email' && !professional.recovery_email) return SILENT_OK

  const professionalId = professional.id

  // ── Anti-abuse: 5min mínimo entre requests ────────────────────────────────
  const { data: recentToken } = await supabase
    .from('recovery_tokens')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('purpose', 'reset_pin')
    .is('used_at', null)
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .maybeSingle()

  if (recentToken) {
    // Anti-abuse silencioso — não revela que request foi ignorado
    return SILENT_OK
  }

  // ── Gera token ────────────────────────────────────────────────────────────
  const token    = randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  const destination = channel === 'email'
    ? professional.recovery_email!
    : professional.phone_number

  const { error: insertErr } = await supabase.from('recovery_tokens').insert({
    professional_id: professionalId,
    channel,
    token,
    destination,
    purpose: 'reset_pin',
    expires_at: expiresAt,
  })

  if (insertErr) {
    console.error('[forgot-pin/request] Falha ao inserir recovery_token:', insertErr.message)
    return SILENT_OK
  }

  const resetLink = `${APP_URL}/auth/reset-pin?token=${token}`

  // ── Envia via canal escolhido ─────────────────────────────────────────────
  try {
    if (channel === 'sms') {
      // SMS curto — manter < 160 chars (1 segmento Twilio)
      // "Lara: reset seu PIN: <link> (30min). Nao compartilhe." ≈ ~95 + link
      await sendSms({
        to: professional.phone_number,
        body: `Lara: reset seu PIN em ${resetLink} (expira em 30min). Não compartilhe.`,
      })
    } else {
      await sendEmail({
        to: professional.recovery_email!,
        subject: 'Resetar PIN da Lara',
        html: buildEmailHtml(`
          <p style="font-size:15px;line-height:1.6;color:#374151;">
            Recebemos uma solicitação para resetar o PIN de acesso ao painel da Lara.
          </p>
          <p style="margin:24px 0;">
            <a href="${resetLink}"
               style="display:inline-block;background-color:#f43f5e;color:#ffffff;
                      padding:12px 24px;border-radius:12px;text-decoration:none;
                      font-weight:600;font-size:15px;">
              Resetar meu PIN
            </a>
          </p>
          <p style="font-size:13px;color:#6b7280;line-height:1.6;">
            Este link expira em <strong>30 minutos</strong>.<br>
            Se não foi você quem pediu, ignore este email — seu PIN continua o mesmo.<br>
            Não compartilhe este link com ninguém.
          </p>
          <p style="font-size:12px;color:#9ca3af;margin-top:16px;">
            Ou copie o link: ${resetLink}
          </p>
        `),
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido'
    console.error('[forgot-pin/request] Falha ao enviar via', channel, ':', msg)
    // Retorna 200 mesmo em falha — não vaza o erro para o cliente
  }

  return SILENT_OK
}
