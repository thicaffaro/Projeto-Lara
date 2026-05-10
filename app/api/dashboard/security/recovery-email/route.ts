/**
 * PATCH /api/dashboard/security/recovery-email
 * Atualiza o email de recuperação da profissional.
 *
 * - Validação de formato de email
 * - NÃO valida unicidade (decisão Opção A: email familiar é caso legítimo)
 * - Audit log com event_type='recovery_email_updated'
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { email } = (body ?? {}) as { email?: string }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Formato de email inválido' }, { status: 400 })
  }

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

  // Busca professional_id
  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

  const professionalId = (prof as unknown as { id: string }).id

  // Atualiza recovery_email
  const { error: updateErr } = await supabaseAdmin
    .from('professionals')
    .update({ recovery_email: email.trim().toLowerCase() })
    .eq('id', professionalId)

  if (updateErr) {
    console.error('[security/recovery-email] Falha ao atualizar:', updateErr.message)
    return NextResponse.json({ error: 'Falha ao salvar. Tente novamente.' }, { status: 500 })
  }

  // Audit log
  await supabaseAdmin.from('audit_log').insert({
    professional_id: professionalId,
    actor: 'professional',
    action: 'recovery_email_updated',
    new_data: { email_domain: email.split('@')[1] ?? 'redacted' }, // não logar email completo
  }).then(null, (e: Error) =>
    console.error('[security/recovery-email] audit_log falhou:', e.message)
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}
