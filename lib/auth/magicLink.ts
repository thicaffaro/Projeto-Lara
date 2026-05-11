/**
 * /lib/auth/magicLink.ts
 * Magic link: geração e validação de tokens de acesso ao dashboard.
 *
 * Usa a tabela magic_links (já existente de 0001_initial.sql).
 * Token: crypto.randomUUID() — UUID v4, 36 chars, criptograficamente seguro.
 *
 * Propósitos:
 *   'dashboard'    → uso único (7 dias) — acesso principal
 *   'notification' → múltiplos usos até expirar (30 dias) — links em notificações
 *   'chat'         → uso único (24h) — acesso direto a conversa específica
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'

// Expiração por propósito
const EXPIRY_MS: Record<string, number> = {
  dashboard:    7  * 24 * 60 * 60 * 1000,
  notification: 30 * 24 * 60 * 60 * 1000,
  chat:         24 *       60 * 60 * 1000,
}

export interface MagicLinkResult {
  token: string
  url: string
}

export interface ValidatedMagicLink {
  professionalId: string
  purpose: string
}

/**
 * Gera magic link para a profissional.
 * Single-use para 'dashboard' e 'chat'; multi-use para 'notification'.
 */
export async function generateMagicLink(
  professionalId: string,
  purpose: string = 'dashboard',
): Promise<MagicLinkResult> {
  const supabase  = createAdminClient()
  const token     = randomUUID()
  const expiryMs  = EXPIRY_MS[purpose] ?? EXPIRY_MS.dashboard
  const expiresAt = new Date(Date.now() + expiryMs).toISOString()

  await supabase.from('magic_links').insert({
    professional_id: professionalId,
    token,
    purpose,
    expires_at: expiresAt,
  })

  const url = `${APP_URL}/d/${token}`
  return { token, url }
}

/**
 * Valida token e retorna professional_id + purpose se válido.
 * Tokens 'dashboard' e 'chat' são marcados como usados (single-use).
 * Tokens 'notification' podem ser usados múltiplas vezes até expirar.
 */
export async function validateMagicLink(
  token: string,
): Promise<ValidatedMagicLink | null> {
  if (!token) return null

  const supabase = createAdminClient()

  const { data: raw } = await supabase
    .from('magic_links')
    .select('id, professional_id, purpose, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  type MagicLinkRow = {
    id: string
    professional_id: string
    purpose: string
    expires_at: string
    used_at: string | null
  }

  const link = raw as unknown as MagicLinkRow | null
  if (!link) return null

  // Expirado?
  if (new Date(link.expires_at) < new Date()) return null

  // Single-use: já utilizado?
  const isSingleUse = link.purpose === 'dashboard' || link.purpose === 'chat'
  if (isSingleUse && link.used_at) return null

  // Marca como usado (apenas single-use)
  if (isSingleUse) {
    await supabase
      .from('magic_links')
      .update({ used_at: new Date().toISOString() })
      .eq('id', link.id)
  }

  return { professionalId: link.professional_id, purpose: link.purpose }
}
