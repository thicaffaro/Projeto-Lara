/**
 * /app/dashboard/lara/security/change-pin/page.tsx
 * Form de troca de PIN em 3 etapas com stepper visual.
 *
 * Etapa 1: PIN atual (validado via bcrypt no server)
 * Etapa 2: PIN novo (validação inline de PIN trivial)
 * Etapa 3: Confirmar PIN novo (deve bater com etapa 2)
 *
 * Se primeiro acesso (sem PIN existente), etapa 1 é pulada.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ChangePinForm } from './ChangePinForm'

export default async function ChangePinPage() {
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
    .select('dashboard_pin_hash')
    .eq('auth_user_id', user.id)
    .single()

  const hasExistingPin = !!(raw as unknown as { dashboard_pin_hash: string | null } | null)
    ?.dashboard_pin_hash

  return (
    <main className="mx-auto max-w-sm px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {hasExistingPin ? 'Trocar PIN' : 'Criar PIN'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {hasExistingPin
            ? 'Insira seu PIN atual e escolha um novo.'
            : 'Crie um PIN de 4 dígitos para acessar o painel rapidamente.'}
        </p>
      </div>
      <ChangePinForm hasExistingPin={hasExistingPin} />
    </main>
  )
}
