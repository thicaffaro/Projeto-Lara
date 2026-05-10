/**
 * /middleware.ts
 * Next.js Edge Middleware — executa antes de qualquer route handler.
 *
 * RESPONSABILIDADES:
 *  1. Rate limiting por rota (via Upstash) — antes de qualquer auth check
 *  2. Headers de segurança adicionais para rotas de API
 *
 * LIMITES:
 *   /api/onboarding/*     → 5  req/min por IP
 *   /api/dashboard/auth/* → 10 req/min por IP
 *   /api/admin/*          → 30 req/min por userId (header x-user-id)
 *   /api/webhooks/*       → SEM LIMITE (HMAC protege)
 *
 * NOTAS:
 *  - Rota /api/webhooks/* é explicitamente excluída do rate limit
 *  - Em desenvolvimento (Upstash não configurado), rate limit é ignorado
 *  - userId para admin vem do header x-user-id (injetado pelo auth layer)
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/ratelimit'

// ── Configuração do matcher ───────────────────────────────────────────────────

export const config = {
  matcher: [
    '/api/onboarding/:path*',
    '/api/dashboard/auth/:path*',
    '/api/admin/:path*',
    // /api/webhooks/* é intencionalmente EXCLUÍDO — HMAC é a proteção
  ],
}

// ── Middleware principal ──────────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  // ── Determina contexto e identificador ─────────────────────────────────────
  let context: 'onboarding' | 'auth' | 'admin'
  let identifier: string

  if (pathname.startsWith('/api/onboarding/')) {
    context    = 'onboarding'
    identifier = getClientIp(req)

  } else if (pathname.startsWith('/api/dashboard/auth/')) {
    context    = 'auth'
    identifier = getClientIp(req)

  } else if (pathname.startsWith('/api/admin/')) {
    context    = 'admin'
    // Para admin, usa userId do header (injetado pelo auth layer do dashboard)
    // Fallback para IP se userId não disponível (requests não autenticados são bloqueados antes)
    identifier = req.headers.get('x-user-id') ?? getClientIp(req)

  } else {
    // Rota não coberta pelo matcher — deixar passar
    return NextResponse.next()
  }

  // ── Verificar rate limit ───────────────────────────────────────────────────
  let rateLimitResult: Awaited<ReturnType<typeof checkRateLimit>>

  try {
    rateLimitResult = await checkRateLimit(context, identifier)
  } catch (err) {
    // Falha no Redis → fail-open (não bloqueia) em produção
    // Logar para monitoramento mas não degradar a experiência
    const msg = err instanceof Error ? err.message : 'erro desconhecido'
    console.error('[middleware] checkRateLimit falhou:', msg, 'path:', pathname)
    return NextResponse.next()
  }

  // ── Resposta 429 se limite excedido ───────────────────────────────────────
  if (!rateLimitResult.success) {
    const headers = rateLimitHeaders(rateLimitResult)

    return NextResponse.json(
      {
        error: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
        retryAfter: headers['Retry-After'],
      },
      {
        status: 429,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      },
    )
  }

  // ── Adiciona headers de rate limit à response normal ──────────────────────
  const response = NextResponse.next()
  const rlHeaders = rateLimitHeaders(rateLimitResult)

  Object.entries(rlHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}
