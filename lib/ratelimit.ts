/**
 * /lib/ratelimit.ts
 * Rate limiting via Upstash Ratelimit + Redis.
 *
 * LIMITES POR ROTA:
 *   /api/onboarding/*        → 5  req/min por IP        (evitar abuso de cadastro)
 *   /api/dashboard/auth/*    → 10 req/min por IP        (evitar brute-force de PIN)
 *   /api/admin/*             → 30 req/min por userId    (admin autenticado)
 *   /api/webhooks/*          → sem limite               (HMAC é a proteção real)
 *
 * FALLBACK:
 *   Se Upstash não estiver configurado (UPSTASH_REDIS_REST_URL ausente),
 *   rate limiting é ignorado com warning — nunca bloqueia em dev/CI.
 *
 * USO NO MIDDLEWARE:
 *   const result = await checkRateLimit(req)
 *   if (!result.success) return rateLimitResponse(result)
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number   // timestamp Unix em ms
  identifier: string
}

// ── Factory: cria instância Ratelimit ou null se Redis não configurado ────────

function createRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN ausentes em produção — rate limit desativado')
    }
    return null
  }

  return new Redis({ url, token })
}

// Instâncias com limites distintos por contexto
// Sliding Window: janela deslizante de 60s — mais suave que Fixed Window

let _onboardingLimiter: Ratelimit | null = null
let _authLimiter: Ratelimit | null = null
let _adminLimiter: Ratelimit | null = null

function getOnboardingLimiter(): Ratelimit | null {
  if (!_onboardingLimiter) {
    const redis = createRedis()
    if (!redis) return null
    _onboardingLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'lara:rl:onboarding',
      analytics: false,
    })
  }
  return _onboardingLimiter
}

function getAuthLimiter(): Ratelimit | null {
  if (!_authLimiter) {
    const redis = createRedis()
    if (!redis) return null
    _authLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      prefix: 'lara:rl:auth',
      analytics: false,
    })
  }
  return _authLimiter
}

function getAdminLimiter(): Ratelimit | null {
  if (!_adminLimiter) {
    const redis = createRedis()
    if (!redis) return null
    _adminLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '60 s'),
      prefix: 'lara:rl:admin',
      analytics: false,
    })
  }
  return _adminLimiter
}

// ── Extração de identificador ──────────────────────────────────────────────────

/**
 * Extrai IP do request para uso como identificador.
 * Suporta Vercel (x-forwarded-for) e outros proxies.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return 'unknown'
}

// ── API pública ────────────────────────────────────────────────────────────────

type RateLimitContext = 'onboarding' | 'auth' | 'admin'

/**
 * Verifica rate limit para o contexto e identificador fornecidos.
 *
 * @param context    - Qual limite aplicar (onboarding | auth | admin)
 * @param identifier - IP (onboarding/auth) ou userId (admin)
 * @returns RateLimitResult — `success: true` se dentro do limite
 */
export async function checkRateLimit(
  context: RateLimitContext,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter =
    context === 'onboarding' ? getOnboardingLimiter()
    : context === 'auth'     ? getAuthLimiter()
    : getAdminLimiter()

  // Redis não configurado → permitir (fallback gracioso)
  if (!limiter) {
    return { success: true, limit: Infinity, remaining: Infinity, reset: 0, identifier }
  }

  const result = await limiter.limit(identifier)

  return {
    success:    result.success,
    limit:      result.limit,
    remaining:  result.remaining,
    reset:      result.reset,
    identifier,
  }
}

/**
 * Retorna os headers padrão de rate limit para incluir em responses.
 * Compatível com draft RFC 6585 / RateLimit-* headers.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit':     String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset':     String(Math.ceil(result.reset / 1000)), // Unix seconds
    'Retry-After':           String(Math.ceil((result.reset - Date.now()) / 1000)),
  }
}
