/**
 * POST /api/dashboard/auth/request-renewal
 * Gera novo magic link e envia via WhatsApp.
 * Aceita phone_number no body (para casos onde a profissional não está autenticada).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateMagicLink } from '@/lib/auth/magicLink'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({})) as { phone_number?: string }
  const { phone_number } = body

  if (!phone_number) {
    // Retorna 200 sem revelar que o número não foi encontrado
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()
  const digits   = phone_number.replace(/\D/g, '')

  const { data: raw } = await supabase
    .from('professionals')
    .select('id, name, phone_number')
    .or(`phone_number.eq.${digits},phone_number.eq.55${digits}`)
    .maybeSingle()

  type ProfRow = { id: string; name: string; phone_number: string }
  const prof = raw as unknown as ProfRow | null

  // Sempre retorna 200 — não vaza existência
  if (!prof) return NextResponse.json({ ok: true })

  try {
    const { url } = await generateMagicLink(prof.id, 'dashboard')
    await sendFromOfficialNumber(
      prof.phone_number,
      `Oi ${prof.name}! Aqui está seu link de acesso ao painel da Lara (válido por 7 dias):\n${url}\n\nNão compartilhe com ninguém.`,
    )
  } catch (err) {
    console.error('[request-renewal] erro:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true })
}
