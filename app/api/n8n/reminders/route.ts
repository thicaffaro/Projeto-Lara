/**
 * POST /api/n8n/reminders
 * Cron a cada 30 minutos (flow_reminders no n8n).
 *
 * Busca appointments confirmados com lembretes pendentes e envia via Lara:
 *   - Lembrete 24h: starts_at entre now+23h e now+25h, reminder_24h_sent=false
 *   - Lembrete 2h:  starts_at entre now+1.5h e now+2.5h, reminder_2h_sent=false
 *
 * Lembrete domiciliar (service_location='client_home') inclui endereço do contato.
 * Usa sendMessageWithFallback: texto livre dentro da janela 24h, template fora dela.
 *
 * maxDuration: 60s — pode processar múltiplos lembretes por execução.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { sendMessageWithFallback, TEMPLATE_FALLBACKS } from '@/lib/templates'
import { formatTz }                  from '@/lib/timezone'

export const maxDuration = 60

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ReminderAppointment {
  id:               string
  starts_at:        string
  service_location: string
  protocol_name:    string
  contact_id:       string
  professional_id:  string
  contacts: {
    name:                   string | null
    phone_number:           string
    address:                Record<string, string> | null
    last_inbound_message_at:string | null
  }
  professionals: {
    meta_phone_number_id: string | null
    access_token_encrypted: string | null
    timezone:             string
    name:                 string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAddress(address: Record<string, string> | null): string | null {
  if (!address) return null
  const parts = [
    address.street,
    address.number ? `nº ${address.number}` : null,
    address.complement || null,
    address.neighborhood || address.bairro || null,
    address.city || address.cidade || null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Autenticação
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.N8N_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now      = new Date()
  const results  = { sent_24h: 0, sent_2h: 0, errors: 0 }

  // ── Lembretes 24h ──────────────────────────────────────────────────────────
  const from24 = new Date(now.getTime() + 23 * 3600_000).toISOString()
  const to24   = new Date(now.getTime() + 25 * 3600_000).toISOString()

  const { data: appts24, error: err24 } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, service_location, protocol_name, contact_id, professional_id,
      contacts!appointments_contact_id_fkey(name, phone_number, address, last_inbound_message_at),
      professionals!appointments_professional_id_fkey(meta_phone_number_id, access_token_encrypted, timezone, name)
    `)
    .eq('status',             'confirmed')
    .eq('reminder_24h_sent',  false)
    .gte('starts_at',         from24)
    .lte('starts_at',         to24)

  if (err24) {
    console.error('[reminders] 24h query error:', err24.message)
  }

  for (const raw of (appts24 ?? []) as unknown as ReminderAppointment[]) {
    const contact = raw.contacts
    const prof    = raw.professionals

    if (!prof?.meta_phone_number_id) continue

    try {
      const tz       = prof.timezone ?? 'America/Sao_Paulo'
      const hora     = formatTz(raw.starts_at, 'HH:mm',   tz)
      const nome     = contact.name ?? 'Cliente'
      const protocolo = raw.protocol_name

      const result = await sendMessageWithFallback({
        professionalId: raw.professional_id,
        contactId:      raw.contact_id,
        toPhoneNumber:  contact.phone_number,
        templateName:   'reminder_24h',
        templateParams: [nome, hora, protocolo],
        fallbackText:   TEMPLATE_FALLBACKS.reminder_24h(nome, hora, protocolo),
      })

      if (result.ok || result.method !== 'failed') {
        await supabase
          .from('appointments')
          .update({ reminder_24h_sent: true })
          .eq('id', raw.id)
        results.sent_24h++
      } else {
        console.error('[reminders] 24h send failed:', raw.id, result.error)
        results.errors++
      }
    } catch (err) {
      console.error('[reminders] 24h exception:', raw.id, err instanceof Error ? err.message : err)
      results.errors++
    }
  }

  // ── Lembretes 2h ───────────────────────────────────────────────────────────
  const from2 = new Date(now.getTime() + 1.5 * 3600_000).toISOString()
  const to2   = new Date(now.getTime() + 2.5 * 3600_000).toISOString()

  const { data: appts2h, error: err2h } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, service_location, protocol_name, contact_id, professional_id,
      contacts!appointments_contact_id_fkey(name, phone_number, address, last_inbound_message_at),
      professionals!appointments_professional_id_fkey(meta_phone_number_id, access_token_encrypted, timezone, name, service_mode)
    `)
    .eq('status',            'confirmed')
    .eq('reminder_2h_sent',  false)
    .gte('starts_at',        from2)
    .lte('starts_at',        to2)

  if (err2h) {
    console.error('[reminders] 2h query error:', err2h.message)
  }

  for (const raw of (appts2h ?? []) as unknown as ReminderAppointment[]) {
    const contact = raw.contacts
    const prof    = raw.professionals

    if (!prof?.meta_phone_number_id) continue

    try {
      const tz        = prof.timezone ?? 'America/Sao_Paulo'
      const hora      = formatTz(raw.starts_at, 'HH:mm',   tz)
      const dia       = formatTz(raw.starts_at, 'dd/MM',   tz)
      const nome      = contact.name ?? 'Cliente'
      const protocolo = raw.protocol_name

      let result: Awaited<ReturnType<typeof sendMessageWithFallback>>

      if (raw.service_location === 'client_home') {
        // Lembrete domiciliar — inclui endereço
        const address = formatAddress(contact.address as Record<string, string> | null)
        const endereco = address ?? 'endereço confirmado pelo app'

        result = await sendMessageWithFallback({
          professionalId: raw.professional_id,
          contactId:      raw.contact_id,
          toPhoneNumber:  contact.phone_number,
          templateName:   'home_visit_confirmation',
          templateParams: [nome, protocolo, dia, hora, endereco],
          fallbackText:   TEMPLATE_FALLBACKS.home_visit_confirmation(nome, protocolo, dia, hora, endereco),
        })
      } else {
        result = await sendMessageWithFallback({
          professionalId: raw.professional_id,
          contactId:      raw.contact_id,
          toPhoneNumber:  contact.phone_number,
          templateName:   'reminder_2h',
          templateParams: [nome, protocolo],
          fallbackText:   TEMPLATE_FALLBACKS.reminder_2h(nome, protocolo),
        })
      }

      if (result.ok || result.method !== 'failed') {
        await supabase
          .from('appointments')
          .update({ reminder_2h_sent: true })
          .eq('id', raw.id)
        results.sent_2h++
      } else {
        console.error('[reminders] 2h send failed:', raw.id, result.error)
        results.errors++
      }
    } catch (err) {
      console.error('[reminders] 2h exception:', raw.id, err instanceof Error ? err.message : err)
      results.errors++
    }
  }

  console.log('[reminders] resultado:', results)
  return NextResponse.json(results)
}
