/**
 * POST /api/dashboard/agenda/block
 * Cria um schedule_block para bloquear horário da agenda.
 * Valida via is_slot_available antes de inserir.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore  = await cookies()
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value
  if (!sessionToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const session = await validateDashboardSession(sessionToken)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    date?: string; start_time?: string; end_time?: string; title?: string
  }

  const { date, start_time, end_time, title } = body

  if (!date || !start_time || !end_time) {
    return NextResponse.json({ error: 'date, start_time e end_time obrigatórios' }, { status: 400 })
  }

  // Monta timestamps UTC a partir de data local
  const startsAt = `${date}T${start_time}:00`
  const endsAt   = `${date}T${end_time}:00`

  if (startsAt >= endsAt) {
    return NextResponse.json({ error: 'Horário de fim deve ser após o início.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verifica conflito via is_slot_available
  const { data: slotRows } = await supabase.rpc('is_slot_available', {
    p_professional_id: session.professionalId,
    p_starts_at:       startsAt,
    p_ends_at:         endsAt,
  })

  type SlotRow = { available: boolean; reason: string }
  const slot = (slotRows as unknown as SlotRow[])?.[0]

  if (slot && !slot.available && slot.reason !== 'outside_working_hours') {
    return NextResponse.json({ error: 'Já existe uma sessão nesse horário.' }, { status: 409 })
  }

  const { error } = await supabase.from('schedule_blocks').insert({
    professional_id: session.professionalId,
    title:           title ?? 'Bloqueado',
    starts_at:       startsAt,
    ends_at:         endsAt,
  })

  if (error) {
    console.error('[agenda/block] insert error:', error.message)
    return NextResponse.json({ error: 'Falha ao bloquear horário.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
