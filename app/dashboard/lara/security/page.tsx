/**
 * /app/dashboard/lara/security/page.tsx
 * Página de segurança da conta — 4 seções.
 * Server Component puro — client interactivity delegada a componentes filhos.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'
import { SecurityCard }             from '@/components/dashboard/SecurityCard'
import { SecurityWhatsAppStatus }   from '@/components/dashboard/SecurityWhatsAppStatus'
import { RecoveryEmailEditButton }  from '@/components/dashboard/RecoveryEmailEditButton'
import { maskEmail }                from '@/lib/mask-email'

export default async function SecurityPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/cadastro')

  const { data: raw } = await supabase
    .from('professionals')
    .select('recovery_email, dashboard_pin_hash, whatsapp_status, whatsapp_status_changed_at')
    .eq('auth_user_id', user.id)
    .single()

  const professional = raw as unknown as {
    recovery_email: string | null
    dashboard_pin_hash: string | null
    whatsapp_status: 'connected' | 'token_invalid' | 'disconnected'
    whatsapp_status_changed_at: string | null
  } | null

  if (!professional) redirect('/onboarding/setup')

  const {
    recovery_email,
    dashboard_pin_hash,
    whatsapp_status,
    whatsapp_status_changed_at,
  } = professional

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Segurança da conta</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie email de recuperação, PIN e dispositivos conectados.
        </p>
      </div>

      <div className="space-y-4">
        {/* ── Seção 1: Email de recuperação ─────────────────────────────── */}
        <SecurityCard
          icon="📧"
          title="Email de recuperação"
          variant={recovery_email ? 'default' : 'warning'}
          action={<RecoveryEmailEditButton currentEmail={recovery_email} />}
        >
          {recovery_email ? (
            <p className="text-sm text-gray-700">
              <span className="font-mono tracking-wide">{maskEmail(recovery_email)}</span>
            </p>
          ) : (
            <div className="flex items-start gap-2">
              <span aria-hidden="true">⚠️</span>
              <p className="text-sm text-amber-700">
                Sem email cadastrado. Se perder o acesso ao PIN, só podemos te ajudar via suporte manual.
              </p>
            </div>
          )}
        </SecurityCard>

        {/* ── Seção 2: PIN de acesso ─────────────────────────────────────── */}
        <SecurityCard
          icon="🔐"
          title="PIN de acesso ao painel"
          description="Seu PIN é a forma mais rápida de acessar o painel sem precisar de novo magic link."
        >
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/dashboard/lara/security/change-pin"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {dashboard_pin_hash ? 'Trocar PIN' : 'Criar PIN'}
            </Link>
            <Link
              href="/auth/forgot-pin"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
            >
              Esqueci meu PIN
            </Link>
          </div>
        </SecurityCard>

        {/* ── Seção 3: Dispositivos ──────────────────────────────────────── */}
        <SecurityCard
          icon="🖥️"
          title="Dispositivos confiáveis"
          action={
            <Link
              href="/dashboard/lara/security/revoke-devices"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
            >
              Encerrar todos
            </Link>
          }
        >
          <p className="text-sm text-gray-500">
            Encerrar o acesso desconecta o painel de todos os dispositivos.
          </p>
          <p className="text-xs text-gray-400">
            Sua conexão WhatsApp e agendamentos{' '}
            <strong>não são afetados</strong>. Você receberá um link no WhatsApp para acessar novamente.
          </p>
        </SecurityCard>

        {/* ── Seção 4: WhatsApp — Client Component (auto-refresh 30s) ──── */}
        <SecurityWhatsAppStatus
          initialStatus={whatsapp_status}
          initialChangedAt={whatsapp_status_changed_at}
        />
      </div>
    </main>
  )
}
