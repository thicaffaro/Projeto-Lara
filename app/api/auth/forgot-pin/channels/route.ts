/**
 * GET /api/auth/forgot-pin/channels?phone=XXXXXXXXXX
 * Retorna os canais disponíveis para recuperação de PIN.
 *
 * Anti-enumeration: se o phone não existir, retorna apenas SMS
 * (sem revelar que a conta não existe).
 *
 * Resposta: { channels: ['sms'] | ['sms','email'], sms_destination, email_destination? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { maskEmail } from '@/lib/mask-email'
import { stripMask } from '@/lib/validation'

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  // Mostra apenas os últimos 4 dígitos: ***-3056
  return `***-${d.slice(-4)}`
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const rawPhone = searchParams.get('phone') ?? ''
  const phone    = stripMask(rawPhone)

  if (phone.length < 10) {
    return NextResponse.json({ channels: ['sms'] as const, sms_destination: '***-****' })
  }

  const supabase = createAdminClient()

  const { data: raw } = await supabase
    .from('professionals')
    .select('phone_number, recovery_email')
    .or(`phone_number.eq.${phone},phone_number.eq.55${phone}`)
    .maybeSingle()

  const professional = raw as unknown as {
    phone_number: string
    recovery_email: string | null
  } | null

  // phone não encontrado → retorna SMS sem revelar não-existência
  if (!professional) {
    return NextResponse.json({
      channels: ['sms'] as const,
      sms_destination: maskPhone(phone),
    })
  }

  const smsDestination = maskPhone(professional.phone_number)

  if (professional.recovery_email) {
    return NextResponse.json({
      channels: ['sms', 'email'] as const,
      sms_destination: smsDestination,
      email_destination: maskEmail(professional.recovery_email),
    })
  }

  return NextResponse.json({
    channels: ['sms'] as const,
    sms_destination: smsDestination,
  })
}
