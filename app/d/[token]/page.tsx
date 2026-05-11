/**
 * /app/d/[token]/page.tsx
 * Landing do magic link — valida token e roteia para PIN ou setup.
 * Não protegido por middleware (qualquer pessoa com o link acessa).
 */

import { redirect } from 'next/navigation'
import { validateMagicLink } from '@/lib/auth/magicLink'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  params: Promise<{ token: string }>
}

export default async function MagicLinkPage({ params }: Props) {
  const { token } = await params

  if (!token) redirect('/auth/expired')

  // Valida token
  const result = await validateMagicLink(token)
  if (!result) redirect('/auth/expired')

  const { professionalId } = result
  const supabase = createAdminClient()

  // Verifica se profissional tem PIN configurado
  const { data: raw } = await supabase
    .from('professionals')
    .select('pin_hash, name')
    .eq('id', professionalId)
    .single()

  type ProfRow = { pin_hash: string | null; name: string }
  const prof = raw as unknown as ProfRow | null

  if (!prof) redirect('/auth/expired')

  const encodedId = encodeURIComponent(professionalId)

  if (prof.pin_hash) {
    // Tem PIN → vai para tela de login com PIN
    redirect(`/auth/pin?pid=${encodedId}`)
  } else {
    // Primeiro acesso → vai para setup de PIN
    redirect(`/auth/setup-pin?pid=${encodedId}`)
  }
}
