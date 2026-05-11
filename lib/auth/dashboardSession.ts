/**
 * /lib/auth/dashboardSession.ts
 * Sessões httpOnly do dashboard da profissional.
 *
 * Cookie: 'dashboard_session' — httpOnly, SameSite=Strict, Secure
 * Validade: 30 dias, renovado a cada request ativo
 * Armazenamento: tabela dashboard_sessions (criada em 0008_dashboard.sql)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

const SESSION_DAYS = 30
const COOKIE_NAME  = 'dashboard_session'

export { COOKIE_NAME }

// ── Criação de sessão ──────────────────────────────────────────────────────────

/**
 * Cria sessão de dashboard após PIN verificado.
 * Retorna o session_token para ser salvo como cookie httpOnly.
 */
export async function createDashboardSession(
  professionalId: string,
  deviceInfo?: string,
): Promise<string> {
  const supabase     = createAdminClient()
  const sessionToken = randomUUID()
  const expiresAt    = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  await supabase.from('dashboard_sessions').insert({
    professional_id: professionalId,
    session_token:   sessionToken,
    device_info:     deviceInfo ?? null,
    expires_at:      expiresAt,
  })

  return sessionToken
}

// ── Validação de sessão ───────────────────────────────────────────────────────

export interface SessionData {
  professionalId: string
}

/**
 * Valida sessão ativa. Atualiza last_active_at.
 * Retorna null se inválida, expirada ou não encontrada.
 */
export async function validateDashboardSession(
  sessionToken: string,
): Promise<SessionData | null> {
  if (!sessionToken) return null

  const supabase = createAdminClient()

  const { data: raw } = await supabase
    .from('dashboard_sessions')
    .select('id, professional_id, expires_at')
    .eq('session_token', sessionToken)
    .maybeSingle()

  type SessionRow = { id: string; professional_id: string; expires_at: string }
  const session = raw as unknown as SessionRow | null

  if (!session) return null
  if (new Date(session.expires_at) < new Date()) return null

  // Atualiza last_active_at (trigger cuida disso, mas garantimos aqui)
  await supabase
    .from('dashboard_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', session.id)

  return { professionalId: session.professional_id }
}

// ── Destruição de sessão ──────────────────────────────────────────────────────

/** Encerra uma sessão específica (logout) */
export async function destroyDashboardSession(sessionToken: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('dashboard_sessions')
    .delete()
    .eq('session_token', sessionToken)
}

/** Encerra todas as sessões da profissional (segurança — Tarefa 4 B3) */
export async function destroyAllSessions(professionalId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('dashboard_sessions')
    .delete()
    .eq('professional_id', professionalId)
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

/** Configuração do cookie para uso em Next.js API routes */
export function getSessionCookieOptions() {
  return {
    name:     COOKIE_NAME,
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge:   SESSION_DAYS * 24 * 60 * 60,
    path:     '/',
  }
}
