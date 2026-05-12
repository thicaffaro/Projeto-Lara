/**
 * POST /api/n8n/proactive-messages
 * Cron a cada 15 minutos (flow_proactive_messages no n8n).
 *
 * Para cada profissional ativa (whatsapp_status='connected', not paused):
 *   1. Verifica horário (nunca entre 22h–8h no timezone da profissional)
 *   2. Verifica regras de proactive_message_rules (globais, sem professional_id)
 *   3. Para regras cron: verifica se o horário atual bate com a expressão
 *   4. Verifica se já foi enviada hoje (proactive_messages_sent)
 *   5. Substitui variáveis no template e envia via número oficial Lara
 *
 * NOTAS:
 *   - proactive_message_rules é uma tabela GLOBAL (sem professional_id)
 *   - Regras do tipo 'event' NÃO são processadas aqui (apenas 'cron')
 *   - As mensagens vão DO número oficial Lara PARA a profissional
 *   - Limite: max 3 mensagens proativas por profissional por dia
 *
 * maxDuration: 60s
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { sendFromOfficialNumber }    from '@/lib/whatsapp'
import { formatTz }                  from '@/lib/timezone'


export const maxDuration = 60

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ProactiveRule {
  id:                       string
  name:                     string
  trigger_condition:        { type: string; cron?: string; condition?: string }
  frequency_limit:          number
  message_template:         string
  link_purpose:             string | null
  enabled:                  boolean
  applicable_service_modes: string[]
}

interface ProfRow {
  id:           string
  name:         string
  phone_number: string
  timezone:     string
  service_mode: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna hora atual (0-23) no timezone dado */
function currentHourInTz(timezone: string): number {
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hour12: false }).format(new Date())
  return parseInt(s, 10)
}

/** Retorna true se o cron-expression bate com o horário atual (aceita "0 8 * * *") */
function matchesCronNow(cronExpr: string, timezone: string): boolean {
  const now      = new Date()
  const local    = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: 'numeric', minute: 'numeric',
    hour12: false, weekday: 'short',
  }).formatToParts(now)

  const hour   = parseInt(local.find(p => p.type === 'hour')?.value   ?? '0', 10)
  const minute = parseInt(local.find(p => p.type === 'minute')?.value ?? '0', 10)

  const [cronMin, cronHour] = cronExpr.split(' ')
  const targetMin  = cronMin  === '*' ? null : parseInt(cronMin,  10)
  const targetHour = cronHour === '*' ? null : parseInt(cronHour, 10)

  // Janela de 15 min para o cron bater (executamos a cada 15 min)
  const minOk = targetMin  === null || Math.abs(minute - targetMin) <= 14
  const hrOk  = targetHour === null || hour === targetHour

  return hrOk && minOk
}

/** Substitui variáveis simples no template */
function renderTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/{{(\w+)}}/g, (_, key) => String(vars[key] ?? ''))
}

// ── Verificar limite diário de proativas por profissional ────────────────────

async function countSentToday(
  supabase: ReturnType<typeof createAdminClient>,
  professionalId: string,
  timezone: string,
): Promise<number> {
  const startOfDay = formatTz(new Date(), "yyyy-MM-dd'T'00:00:00", timezone) + 'Z'
  const { count } = await supabase
    .from('proactive_messages_sent')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', professionalId)
    .gte('sent_at', startOfDay)
  return count ?? 0
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Autenticação
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.N8N_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const results  = { sent: 0, skipped: 0, errors: 0 }

  // Buscar regras globais ativas do tipo 'cron'
  const { data: rawRules, error: rulesErr } = await supabase
    .from('proactive_message_rules')
    .select('id, name, trigger_condition, frequency_limit, message_template, link_purpose, enabled, applicable_service_modes')
    .eq('enabled', true)

  if (rulesErr || !rawRules || rawRules.length === 0) {
    return NextResponse.json({ ...results, reason: 'no_rules' })
  }

  const rules = rawRules as unknown as ProactiveRule[]
  const cronRules = rules.filter(r => r.trigger_condition?.type === 'cron')

  if (cronRules.length === 0) {
    return NextResponse.json({ ...results, reason: 'no_cron_rules' })
  }

  // Buscar profissionais ativas
  const { data: rawProfs, error: profErr } = await supabase
    .from('professionals')
    .select('id, name, phone_number, timezone, service_mode')
    .eq('whatsapp_status', 'connected')
    .eq('is_paused', false)

  if (profErr || !rawProfs || rawProfs.length === 0) {
    return NextResponse.json({ ...results, reason: 'no_active_professionals' })
  }

  const professionals = rawProfs as unknown as ProfRow[]

  for (const prof of professionals) {
    const tz   = prof.timezone ?? 'America/Sao_Paulo'
    const hour = currentHourInTz(tz)

    // Nunca enviar entre 22h–8h
    if (hour >= 22 || hour < 8) {
      results.skipped++
      continue
    }

    // Verificar limite diário
    const sentToday = await countSentToday(supabase, prof.id, tz)
    if (sentToday >= 3) {
      results.skipped++
      continue
    }

    for (const rule of cronRules) {
      // Verificar se a regra se aplica ao service_mode desta profissional
      if (!rule.applicable_service_modes.includes(prof.service_mode)) continue

      // Verificar se o cron bate com o horário atual
      const cronExpr = rule.trigger_condition.cron
      if (!cronExpr || !matchesCronNow(cronExpr, tz)) continue

      // Verificar se já foi enviada hoje para esta profissional
      const { count: alreadySent } = await supabase
        .from('proactive_messages_sent')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', prof.id)
        .eq('rule_name', rule.name)
        .gte('sent_at', formatTz(new Date(), "yyyy-MM-dd'T'00:00:00", tz) + 'Z')

      if ((alreadySent ?? 0) > 0) continue

      try {
        // Buscar dados extras para substituição do template
        let vars: Record<string, string | number> = { professional_name: prof.name }

        if (rule.name === 'good_morning') {
          const todayStart = formatTz(new Date(), "yyyy-MM-dd'T'00:00:00", tz) + 'Z'
          const todayEnd   = formatTz(new Date(), "yyyy-MM-dd'T'23:59:59", tz) + 'Z'

          const { data: todayAppts } = await supabase
            .from('appointments')
            .select('starts_at, contacts!appointments_contact_id_fkey(name)')
            .eq('professional_id', prof.id)
            .eq('status', 'confirmed')
            .gte('starts_at', todayStart)
            .lte('starts_at', todayEnd)
            .order('starts_at')

          if (!todayAppts || todayAppts.length === 0) continue // sem sessões hoje

          const first = todayAppts[0] as unknown as { starts_at: string; contacts: { name: string | null } }
          vars = {
            ...vars,
            appointment_count:    todayAppts.length,
            first_appointment_time: formatTz(first.starts_at, 'HH:mm', tz),
            first_client_name:    first.contacts?.name ?? 'cliente',
          }
        }

        const text = renderTemplate(rule.message_template, vars)
        await sendFromOfficialNumber(prof.phone_number, text)

        // Registrar envio
        await supabase.from('proactive_messages_sent').insert({
          professional_id: prof.id,
          rule_name:       rule.name,
          scope:           'professional',
          sent_at:         new Date().toISOString(),
        })

        results.sent++
      } catch (err) {
        console.error('[proactive] erro:', prof.id, rule.name, err instanceof Error ? err.message : err)
        results.errors++
      }
    }
  }

  console.log('[proactive-messages] resultado:', results)
  return NextResponse.json(results)
}
