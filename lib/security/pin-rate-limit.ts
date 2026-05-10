/**
 * /lib/security/pin-rate-limit.ts
 * Rate limiting específico para tentativas de PIN.
 *
 * Política:
 *   - 3 tentativas erradas em 15 min → bloqueio temporário de 1h
 *   - Durante bloqueio: único caminho é "Esqueci meu PIN"
 *   - Sucesso na validação limpa o contador de tentativas
 *
 * Implementado com @upstash/redis (não usa Ratelimit do upstash,
 * pois o padrão de "3 strikes → block separado" requer controle manual).
 *
 * Keys:
 *   lara:pin_attempts:{professionalId}  → INT, TTL 15min
 *   lara:pin_blocked:{professionalId}   → '1', TTL 1h
 */

import { Redis } from '@upstash/redis'

const MAX_ATTEMPTS    = 3
const WINDOW_SECONDS  = 15 * 60  // 15 minutos
const BLOCK_SECONDS   = 60 * 60  // 1 hora

function getRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[pin-rate-limit] Redis não configurado — rate limit desativado')
    }
    return null
  }
  return new Redis({ url, token })
}

const attemptsKey = (id: string) => `lara:pin_attempts:${id}`
const blockKey    = (id: string) => `lara:pin_blocked:${id}`

export interface PinRateLimitStatus {
  /** true se o profissional está em bloqueio temporário */
  blocked: boolean
  /** Tentativas restantes antes do bloqueio (0 se já bloqueado) */
  remaining: number
  /** Segundos até o bloqueio expirar (se blocked=true) */
  ttlSeconds?: number
}

/**
 * Verifica se o profissional está bloqueado ou quantas tentativas restam.
 */
export async function checkPinRateLimit(
  professionalId: string,
): Promise<PinRateLimitStatus> {
  const redis = getRedis()
  if (!redis) return { blocked: false, remaining: MAX_ATTEMPTS }

  // Verifica se está em bloqueio ativo
  const [isBlocked, blockTtl] = await Promise.all([
    redis.exists(blockKey(professionalId)),
    redis.ttl(blockKey(professionalId)),
  ])

  if (isBlocked) {
    return { blocked: true, remaining: 0, ttlSeconds: blockTtl > 0 ? blockTtl : undefined }
  }

  // Conta tentativas
  const count = (await redis.get(attemptsKey(professionalId)) as number | null) ?? 0
  return { blocked: false, remaining: Math.max(0, MAX_ATTEMPTS - count) }
}

/**
 * Registra uma tentativa de PIN errada.
 * @returns true se o profissional foi bloqueado agora, false se ainda tem tentativas
 */
export async function recordFailedPinAttempt(
  professionalId: string,
): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false

  const key   = attemptsKey(professionalId)
  const count = await redis.incr(key)

  // Garante TTL na janela de 15min
  await redis.expire(key, WINDOW_SECONDS)

  if (count >= MAX_ATTEMPTS) {
    // Bloqueia por 1h e limpa o contador de tentativas
    await Promise.all([
      redis.set(blockKey(professionalId), '1', { ex: BLOCK_SECONDS }),
      redis.del(key),
    ])
    return true // agora bloqueado
  }

  return false
}

/**
 * Limpa o contador após PIN correto (previne bloqueio por engano).
 */
export async function clearPinAttempts(professionalId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.del(attemptsKey(professionalId))
}
