/**
 * /lib/ai/bookingFlow.ts
 * Fluxo de agendamento: coleta dados via LLM, verifica is_slot_available,
 * cria appointment e confirma via sendLaraTextMessage.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { callLLM, type LLMMessage } from './llm'
import {
  buildSystemPromptBooking,
  type ProfessionalContext,
  type ContactContext,
  type BookingState,
} from './prompts'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ProfRow {
  id: string
  phone_number: string
  service_mode: string
  timezone: string
}

// ── Extração heurística de BookingState ───────────────────────────────────────

/** Detecta protocolo nas últimas mensagens por match parcial no nome */
function extractProtocol(text: string, protocols: string): string | undefined {
  const lines = protocols.split(' | ')
  for (const line of lines) {
    const name = line.split(' (')[0].toLowerCase()
    if (text.toLowerCase().includes(name)) return line.split(' (')[0]
  }
  return undefined
}

/** Detecta data no texto — suporta "amanhã", "sexta", "dia 15", "15/01" */
function extractDate(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/) ??
                text.match(/dia\s+(\d{1,2})\b/i)
  if (match) return match[0]

  const relative: Record<string, number> = {
    hoje: 0, amanhã: 1, 'depois de amanhã': 2,
    segunda: 1, terça: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, domingo: 7,
  }
  const lower = text.toLowerCase()
  for (const [key, offset] of Object.entries(relative)) {
    if (lower.includes(key)) {
      const d = new Date()
      d.setDate(d.getDate() + offset)
      return d.toISOString().slice(0, 10)
    }
  }
  return undefined
}

/** Detecta hora no texto — "14h", "14:00", "as 2" */
function extractTime(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2})h(\d{0,2})\b/i) ??
                text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (!match) return undefined
  const h = match[1].padStart(2, '0')
  const m = (match[2] || '00').padStart(2, '0')
  return `${h}:${m}`
}

/** Extrai BookingState heuristicamente do histórico de mensagens */
function extractBookingStateFromHistory(
  messages: LLMMessage[],
  profContext: ProfessionalContext,
  isHome: boolean,
): BookingState {
  const text = messages.map(m => m.content).join(' ')
  const attempts = messages.filter(m => m.role === 'assistant').length

  return {
    protocol_name:  extractProtocol(text, profContext.protocols_list),
    preferred_date: extractDate(text),
    preferred_time: extractTime(text),
    client_address: isHome
      ? text.match(/(?:rua|av\.|avenida|alameda|travessa)[^.,\n]{3,60}/i)?.[0]
      : undefined,
    attempt: attempts,
  }
}

// ── handleBookingFlow ─────────────────────────────────────────────────────────

export async function handleBookingFlow(
  contactId: string,
  messageText: string,
  profContext: ProfessionalContext,
  contactCtx: ContactContext,
  prof: ProfRow,
): Promise<{ responseText: string; llmProvider: string }> {
  const supabase = createAdminClient()
  const isHome = prof.service_mode === 'home' || prof.service_mode === 'both'

  // ── Busca últimas 10 mensagens do contato ────────────────────────────────
  const { data: rawMessages } = await supabase
    .from('messages')
    .select('direction, content, sent_by, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(10)

  type MsgRow = { direction: string; content: string | null; sent_by: string | null }
  const history = ((rawMessages ?? []) as MsgRow[])
    .reverse()
    .filter(m => m.content)
    .map(m => ({
      role: (m.direction === 'outbound' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content!,
    }))

  // Adiciona a mensagem atual
  const messages: LLMMessage[] = [
    ...history,
    { role: 'user', content: messageText },
  ]

  // ── Extrai BookingState do histórico ─────────────────────────────────────
  const bookingState = extractBookingStateFromHistory(
    messages, profContext, isHome,
  )

  // ── Chama LLM com prompt de agendamento ──────────────────────────────────
  const systemPrompt = buildSystemPromptBooking(profContext, contactCtx, bookingState)
  const llmResult = await callLLM(
    [{ role: 'system', content: systemPrompt }, ...messages],
    { maxTokens: 300, temperature: 0.3 },
  )

  const raw = llmResult.text.trim()

  // ── Tenta parsear JSON da resposta ───────────────────────────────────────
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        action: string
        protocol?: string
        date?: string
        time?: string
        address?: string | null
        reason?: string
      }

      // ── Confirmar agendamento ─────────────────────────────────────────────
      if (parsed.action === 'confirm' && parsed.protocol && parsed.date && parsed.time) {
        const startsAt = new Date(`${parsed.date}T${parsed.time}:00`)

        // Busca duração do protocolo nos dados do profissional
        const protocolDurationMin = 60 // padrão 60min — refinado no Prompt D
        const endsAt = new Date(startsAt.getTime() + protocolDurationMin * 60_000)

        // Verifica disponibilidade via RPC
        const { data: slotRows } = await supabase
          .rpc('is_slot_available', {
            p_professional_id: prof.id,
            p_starts_at:        startsAt.toISOString(),
            p_ends_at:          endsAt.toISOString(),
            p_contact_id:       contactId,
          })

        const slot = (slotRows as Array<{ available: boolean; reason: string }>)?.[0]

        if (slot?.available) {
          // Cria appointment
          await supabase.from('appointments').insert({
            professional_id:  prof.id,
            contact_id:       contactId,
            protocol_name:    parsed.protocol,
            starts_at:        startsAt.toISOString(),
            ends_at:          endsAt.toISOString(),
            status:           'confirmed',
            service_location: isHome ? 'client_home' : 'studio',
            source:           'whatsapp',
          })

          // Eleva contact_type para 'client' se era 'unknown'
          await supabase
            .from('contacts')
            .update({ contact_type: 'client' })
            .eq('id', contactId)
            .eq('contact_type', 'unknown')

          const dateLabel = startsAt.toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: '2-digit',
          })
          const timeLabel = parsed.time

          return {
            responseText: `Perfeito! ✅ Sessão de ${parsed.protocol} confirmada para ${dateLabel} às ${timeLabel}. Te mando lembrete antes! 💛`,
            llmProvider:  llmResult.provider,
          }
        } else {
          // Slot indisponível — pede alternativa
          const reason = slot?.reason ?? 'horário_indisponível'
          console.log('[bookingFlow] slot unavailable:', reason, 'contact:', contactId)

          return {
            responseText: `Ops! Esse horário já está ocupado. 😅 Deixa eu checar outras opções para você. Tem preferência de dia ou turno?`,
            llmProvider:  llmResult.provider,
          }
        }
      }

      // ── Handover por dados insuficientes ──────────────────────────────────
      if (parsed.action === 'handover') {
        return {
          responseText: `__handover__:${parsed.reason ?? 'dados_insuficientes'}`,
          llmProvider:  llmResult.provider,
        }
      }

    } catch {
      // JSON inválido — tratar como texto normal
    }
  }

  // Resposta textual (coleta de informações ainda em andamento)
  return {
    responseText: raw || `Pode me dizer qual protocolo você quer agendar e qual dia te fica melhor? 😊`,
    llmProvider:  llmResult.provider,
  }
}
