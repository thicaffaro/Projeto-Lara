/**
 * /lib/supabase/admin.ts
 * Factory do cliente Supabase com service_role key.
 *
 * REGRAS DE USO:
 * - NUNCA importar em código client-side (componentes 'use client')
 * - NUNCA expor ao browser — SUPABASE_SERVICE_ROLE_KEY bypassa RLS
 * - Usar APENAS em: API routes, Server Actions, scripts server-side
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cria um cliente admin com service_role (bypassa RLS).
 * Cada chamada retorna uma nova instância — não é singleton intencional
 * para evitar estado compartilhado entre requests em Edge Runtime.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[supabase/admin] NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
