/**
 * /scripts/seed-admin.ts
 *
 * Cria o usuário administrador super_admin programaticamente via
 * supabase.auth.admin.createUser() e insere o registro em admin_users.
 *
 * Uso:
 *   npx tsx scripts/seed-admin.ts
 *
 * Pré-requisitos no .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_EMAIL
 *   ADMIN_INITIAL_PASSWORD
 *
 * Idempotente: seguro executar múltiplas vezes.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Carrega .env.local (produção) ou .env (desenvolvimento)
const envFile = fs.existsSync(path.resolve(process.cwd(), '.env.local'))
  ? '.env.local'
  : '.env'

dotenv.config({ path: path.resolve(process.cwd(), envFile) })
console.log(`[seed-admin] Usando ${envFile}`)

// ── Validação de variáveis obrigatórias ────────────────────────────────────

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_EMAIL',
  'ADMIN_INITIAL_PASSWORD',
]

const missing = REQUIRED_VARS.filter(v => !process.env[v])
if (missing.length > 0) {
  console.error('[seed-admin] ERRO: variáveis faltando:', missing.join(', '))
  console.error('[seed-admin] Configure-as no .env.local antes de executar.')
  process.exit(1)
}

const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const adminEmail       = process.env.ADMIN_EMAIL!
const adminPassword    = process.env.ADMIN_INITIAL_PASSWORD!

// Cliente com service_role (necessário para auth.admin.createUser)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// ── Main ───────────────────────────────────────────────────────────────────

async function seedAdmin(): Promise<void> {
  console.log(`[seed-admin] Iniciando seed para: ${adminEmail}`)

  const authUserId = await ensureAuthUser(adminEmail, adminPassword)
  await upsertAdminUser(authUserId, adminEmail)

  console.log(`[seed-admin] ✅ Concluído. auth_user_id=${authUserId}`)
  console.log(`[seed-admin] ⚠️  Troque ADMIN_INITIAL_PASSWORD após o primeiro login.`)
}

// ── Funções auxiliares ─────────────────────────────────────────────────────

/**
 * Cria ou recupera o auth user para o email informado.
 * Retorna o UUID do auth user.
 */
async function ensureAuthUser(email: string, password: string): Promise<string> {
  // Tenta criar o usuário
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Pula verificação de email para admin
      user_metadata: {
        role: 'super_admin',
        is_admin: true,
      },
    })

  if (!createError) {
    console.log(`[seed-admin] Auth user criado: ${created.user.id}`)
    return created.user.id
  }

  // Se já existe, busca pelo email
  if (
    createError.message.toLowerCase().includes('already been registered') ||
    createError.message.toLowerCase().includes('already exists')
  ) {
    console.log(`[seed-admin] Auth user já existe. Buscando...`)
    const { data: list, error: listError } =
      await supabase.auth.admin.listUsers({ perPage: 1000 })

    if (listError) throw new Error(`Falha ao listar usuários: ${listError.message}`)

    const existing = list.users.find(u => u.email === email)
    if (!existing) {
      throw new Error(`Auth user com email "${email}" não encontrado após conflito.`)
    }

    // Atualiza metadados caso user_metadata esteja desatualizado
    await supabase.auth.admin.updateUserById(existing.id, {
      user_metadata: { role: 'super_admin', is_admin: true },
    })

    console.log(`[seed-admin] Auth user encontrado: ${existing.id}`)
    return existing.id
  }

  throw new Error(`Falha ao criar auth user: ${createError.message}`)
}

/**
 * Insere ou atualiza o registro em admin_users vinculado ao auth user.
 */
async function upsertAdminUser(authUserId: string, email: string): Promise<void> {
  const { error } = await supabase
    .from('admin_users')
    .upsert(
      {
        auth_user_id: authUserId,
        email,
        role: 'super_admin',
      },
      { onConflict: 'email' }
    )

  if (error) {
    throw new Error(`Falha ao upsert admin_users: ${error.message}`)
  }

  console.log(`[seed-admin] admin_users atualizado: email=${email}, role=super_admin`)
}

// ── Entry point ───────────────────────────────────────────────────────────

seedAdmin().catch(err => {
  console.error('[seed-admin] ERRO FATAL:', err.message)
  process.exit(1)
})
