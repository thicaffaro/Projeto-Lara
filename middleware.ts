/**
 * /middleware.ts
 * Next.js Edge Middleware — executa antes de qualquer route handler.
 *
 * RESPONSABILIDADES:
 *  1. Redirect /dashboard → /onboarding/setup se onboarding_completed=false
 *  2. Rate limiting por rota (via Upstash) — antes de qualquer auth check
 *
 * LIMITES:
 *   /api/onboarding/*     → 5  req/min por IP
 *   /api/dashboard/auth/* → 10 req/min por IP
 *   /api/admin/*          → 30 req/min por userId (header x-user-id)
 *   /api/webhooks/*       → SEM LIMITE (HMAC protege)
 *
 * REDIRECT DE ONBOARDING:
 *  - Lê onboarding_completed do JWT user_metadata (sem query ao banco)
 *  - user_metadata é atualizado em /api/onboarding/state quando passo 7 conclui
 *  - Fail-open: se não conseguir ler o JWT, deixa passar (dashboard verifica)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/ratelimit'

// ── Configuração do matcher ───────────────────────────────────────────────────

export const config = {
  matcher: [
    '/dashboard/:path*',           // redirect de onboarding
    '/api/onboarding/:path*',
    '/api/dashboard/auth/:path*',
    '/api/admin/:path*',
    // /api/webhooks/* é intencionalmente EXCLUÍDO — HMAC é a proteção
  ],
}

// ── Middleware principal ──────────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  // ── Redirect de onboarding ─────────────────────────────────────────────────
  if (pathname.startsWith('/dashboard')) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => req.cookies.getAll(),
            setAll: () => {}, // Edge: não persiste cookies aqui
          },
        }
      )

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Não autenticado — redireciona para login
        return NextResponse.redirect(new URL('/cadastro', req.url))
      }

      // onboarding_completed é armazenado no user_metadata após o passo 7
      // evitando query ao banco em cada request
      const onboardingCompleted = user.user_metadata?.onboarding_completed === true

      if (!onboardingCompleted) {
        return NextResponse.redirect(new URL('/onboarding/setup', req.url))
      }
    } catch {
      // Fail-open: erro ao ler sessão não bloqueia acesso ao dashboard
      // O dashboard (server component) fará a verificação definitiva
    }

    return NextResponse.next()
  }

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
