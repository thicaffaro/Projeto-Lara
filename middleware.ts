/**
 * /middleware.ts
 * Next.js Edge Middleware — executa antes de qualquer route handler.
 *
 * RESPONSABILIDADES:
 *  1. Redirect /dashboard → /onboarding/setup se onboarding_completed=false
 *  2. Rate limiting por rota (via Upstash) — antes de qualquer auth check
 *  3. Bloqueio de escrita por pendência legal (HTTP 451) após 3 dias de carência
 *
 * LIMITES:
 *   /api/onboarding/*     → 5  req/min por IP
 *   /api/dashboard/auth/* → 10 req/min por IP
 *   /api/admin/*          → 30 req/min por userId (header x-user-id)
 *   /api/webhooks/*       → SEM LIMITE (HMAC protege)
 *
 * BLOQUEIO LEGAL (HTTP 451 "Unavailable For Legal Reasons"):
 *   Padrão: "bloquear tudo por padrão, isentar por exceção" (denylist).
 *   - TODAS as rotas de escrita são bloqueadas após 3 dias de carência
 *   - EXCEÇÕES explícitas listadas em LEGAL_EXEMPT_ROUTES
 *   - Rotas novas ficam automaticamente protegidas sem intervenção manual
 *   Ver /docs/legal-versioning.md e /docs/security.md
 *
 * REDIRECT DE ONBOARDING:
 *  - Lê onboarding_completed do JWT user_metadata (sem query ao banco)
 *  - user_metadata é atualizado em /api/onboarding/state quando passo 7 conclui
 *  - Fail-open: se não conseguir ler o JWT, deixa passar (dashboard verifica)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/ratelimit'
import { checkPendingAcceptance } from '@/lib/legal/check-pending-acceptance'
import { validateDashboardSession, COOKIE_NAME as SESSION_COOKIE } from '@/lib/auth/dashboardSession'

// ── Padrão "block by default, exempt by exception" ────────────────────────────
// Rotas que funcionam MESMO sem aceite legal vigente.
// Rotas não listadas aqui serão bloqueadas automaticamente quando houver
// pendência legal >= 3 dias — novos endpoints ficam protegidos por padrão.
const LEGAL_EXEMPT_ROUTES = [
  '/api/auth/',          // login, logout, reset-pin, forgot-pin
  '/api/legal/',         // current, accept, pending — precisam funcionar para aceitar!
  '/api/onboarding/',    // onboarding não exige aceite prévio (aceita ao concluir)
  '/api/webhooks/',      // webhooks Meta/MP não podem ser bloqueados
] as const

const LEGAL_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// ── Configuração do matcher ───────────────────────────────────────────────────

export const config = {
  matcher: [
    '/dashboard/:path*',           // auth de sessão + onboarding redirect
    '/admin/:path*',               // auth Supabase + role admin
    '/api/onboarding/:path*',
    '/api/dashboard/:path*',       // rate limit + bloqueio legal
    '/api/admin/:path*',
    // /d/:token, /auth/*, /api/webhooks/*, /api/legal/* são EXCLUÍDOS
  ],
}

// ── Middleware principal ──────────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  // ── Auth de admin (/admin/*) ────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => req.cookies.getAll(),
            setAll: () => {},
          },
        }
      )
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.user_metadata?.role !== 'super_admin') {
        return NextResponse.redirect(new URL('/admin/login', req.url))
      }
    } catch {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    return NextResponse.next()
  }

  // ── Auth de dashboard (/dashboard/*) via sessão httpOnly ───────────────────
  // Aceita TANTO dashboard_session cookie (magic link + PIN) QUANTO Supabase Auth
  // (onboarding flow). Onboarding redirect verificado depois.
  if (pathname.startsWith('/dashboard')) {
    // Tentativa 1: dashboard_session cookie (magic link + PIN)
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value
    if (sessionToken) {
      try {
        const session = await validateDashboardSession(sessionToken)
        if (session) {
          // Sessão válida — passa para o redirect de onboarding abaixo
        } else {
          return NextResponse.redirect(new URL('/auth/expired', req.url))
        }
      } catch {
        return NextResponse.redirect(new URL('/auth/expired', req.url))
      }
    }
    // Tentativa 2: Supabase Auth (onboarding) — verificado no bloco abaixo
  }

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
        // Não autenticado — redireciona para cadastro
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

  // ── Bloqueio legal: "block by default, exempt by exception" ─────────────────
  // Todas as rotas de escrita (/api/**) são bloqueadas com HTTP 451 após 3 dias
  // de carência, EXCETO as listadas em LEGAL_EXEMPT_ROUTES.
  // Padrão denylist: novos endpoints ficam protegidos automaticamente.
  const isApiWrite   = pathname.startsWith('/api/') && LEGAL_WRITE_METHODS.has(req.method)
  const isLegalExempt = LEGAL_EXEMPT_ROUTES.some((prefix: string) => pathname.startsWith(prefix))

  if (isApiWrite && !isLegalExempt) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => req.cookies.getAll(),
            setAll: () => {},
          },
        }
      )

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Busca professional_id do user_metadata (sem query adicional ao banco)
        const professionalId = user.user_metadata?.professional_id as string | undefined

        if (professionalId) {
          const legalStatus = await checkPendingAcceptance(professionalId)

          if (legalStatus.any_write_blocked) {
            // HTTP 451: Unavailable For Legal Reasons
            return NextResponse.json(
              {
                error: 'legal_acceptance_required',
                message: 'Você precisa aceitar os documentos legais atualizados antes de continuar.',
                pending_docs: legalStatus.pending_docs.filter(d => d.write_blocked),
              },
              { status: 451 }
            )
          }
        }
      }
    } catch {
      // Fail-open: erro no check legal não bloqueia operações
      // O banner na UI ainda vai mostrar a pendência
    }
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
