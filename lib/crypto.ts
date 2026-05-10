/**
 * /lib/crypto.ts
 * Criptografia de tokens de acesso Meta usando a função PL/pgSQL do banco.
 *
 * Usa pgp_sym_encrypt/decrypt via Supabase RPC para manter a lógica
 * de criptografia centralizada no banco (pgcrypto, AES-256).
 *
 * SEGURANÇA CRÍTICA:
 * - TOKEN_ENCRYPTION_KEY é lida do env — NUNCA logar ou expor
 * - Funções aqui são server-only (API routes / Server Actions)
 * - plaintext nunca aparece em logs, erros lançados ou stack traces
 */

import { createAdminClient } from './supabase/admin'

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Representação do token criptografado como Uint8Array (BYTEA do Postgres) */
export type EncryptedToken = Uint8Array

// ── Helpers internos ──────────────────────────────────────────────────────────

function getEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('[crypto] TOKEN_ENCRYPTION_KEY ausente no ambiente')
  if (key.length < 32) throw new Error('[crypto] TOKEN_ENCRYPTION_KEY deve ter mínimo 32 caracteres')
  return key
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Criptografa um token de acesso Meta via `encrypt_access_token` do banco.
 *
 * O plaintext trafega apenas server → banco (TLS).
 * NUNCA aparece em logs ou respostas de erro.
 *
 * @param plainToken - Token em texto plano (NUNCA logar este valor)
 * @returns Buffer com bytes criptografados para armazenar em BYTEA
 */
export async function encryptToken(plainToken: string): Promise<Buffer> {
  const supabase = createAdminClient()
  const key = getEncryptionKey()

  const { data, error } = await supabase.rpc('encrypt_access_token', {
    p_token: plainToken,
    p_key: key,
  })

  if (error) {
    // Log error sem o token ou a chave
    console.error('[crypto] Falha na criptografia:', error.message)
    throw new Error('Falha ao criptografar token de acesso')
  }

  // Supabase retorna BYTEA como string hex: converter para Buffer
  if (typeof data === 'string') {
    return Buffer.from(data.replace(/^\\x/, ''), 'hex')
  }

  return Buffer.from(data)
}

/**
 * Decriptografa um token de acesso usando `decrypt_access_token` do banco.
 *
 * NUNCA armazenar o resultado em variável de longa duração.
 * Usar imediatamente na chamada à API e descartar.
 *
 * @param encrypted - Bytes criptografados do banco (campo access_token_encrypted)
 * @returns Plaintext do token (usar imediatamente, não logar)
 */
export async function decryptToken(encrypted: Buffer | Uint8Array | string): Promise<string> {
  const supabase = createAdminClient()
  const key = getEncryptionKey()

  // Normaliza para hex string que o Postgres aceita
  let hexInput: string
  if (typeof encrypted === 'string') {
    hexInput = encrypted
  } else {
    hexInput = '\\x' + Buffer.from(encrypted).toString('hex')
  }

  const { data, error } = await supabase.rpc('decrypt_access_token', {
    p_encrypted: hexInput,
    p_key: key,
  })

  if (error || !data) {
    console.error('[crypto] Falha na decriptografia:', error?.message ?? 'resultado vazio')
    throw new Error('Falha ao decriptografar token de acesso')
  }

  return data as string
}
