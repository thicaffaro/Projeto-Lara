/**
 * POST /api/onboarding/register-number
 * Etapa 5 do Embedded Signup.
 *
 * Registra o número de telefone via Graph API:
 *   POST /{phone_number_id}/register
 *   body: { messaging_product: 'whatsapp', pin: '000000' }
 *
 * PIN '000000' é o padrão para números sem PIN configurado.
 * Se o número já tiver PIN, o profissional precisará informá-lo
 * (funcionalidade pós-MVP — ver /docs/known-improvements.md).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfessionalToken, registerPhoneNumber, WhatsAppApiError } from '@/lib/whatsapp'

interface RegisterNumberBody {
  professionalId: string
}

function validateBody(body: unknown): body is RegisterNumberBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return typeof b.professionalId === 'string' && b.professionalId.length > 0
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!validateBody(body)) {
    return NextResponse.json({ error: 'professionalId obrigatório' }, { status: 400 })
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
    return NextResponse.json({ error: 'Profissional não encontrado ou número não configurado' }, { status: 404 })
  }

  // Decriptografa token — usar imediatamente, não armazenar
  let accessToken: string
  try {
    accessToken = await getProfessionalToken(professionalId)
  } catch {
    console.error('[register-number] Falha ao obter token para profissional:', professionalId)
    return NextResponse.json({ error: 'Falha ao autenticar com a Meta. Reconecte o WhatsApp.' }, { status: 500 })
  }

  // Registra número via Graph API
  try {
    await registerPhoneNumber(professional.meta_phone_number_id, accessToken, professionalId)
  } catch (err) {
    const msg = err instanceof WhatsAppApiError ? err.message : 'Falha ao registrar número'
    console.error('[register-number] Falha:', msg, 'professional:', professionalId)
    return NextResponse.json({ error: msg }, { status: 502 })
  } finally {
    // Zera referência local do token
    ;(accessToken as any) = null
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
