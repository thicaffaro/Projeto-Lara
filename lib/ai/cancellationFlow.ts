/**
 * /lib/ai/cancellationFlow.ts
 * Fluxo de cancelamento: localiza próximo appointment confirmado,
 * confirma intenção via LLM e aplica a ação.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { callLLM } from './llm'
import { buildSystemPromptCancellation, type ProfessionalContext, type AppointmentInfo } from './prompts'

interface ProfRow {
  id: string
  phone_number: string
}

export async function handleCancellationFlow(
  contactId: string,
  messageText: string,
  profContext: ProfessionalContext,
  prof: ProfRow,
): Promise<{ responseText: string; llmProvider: string }> {
  const supabase = createAdminClient()

  // ── Busca próximo appointment confirmado ─────────────────────────────────
  const { data: rawAppt } = await supabase
    .from('appointments')
    .select('id, protocol_name, starts_at, ends_at')
    .eq('contact_id', contactId)
    .eq('status', 'confirmed')
    .gt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  type ApptRow = { id: string; protocol_name: string; starts_at: string }
  const appointment = rawAppt as unknown as ApptRow | null

  if (!appointment) {
    return {
      responseText: `Não encontrei uma sessão agendada para cancelar. Tem certeza que é comigo? 😊`,
      llmProvider:  'rule_based',
    }
  }

  // ── Formata informações da sessão ────────────────────────────────────────
  const apptDate   = new Date(appointment.starts_at)
  const dateLabel  = apptDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeLabel  = apptDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const appointmentInfo: AppointmentInfo = {
    protocol_name: appointment.protocol_name,
    date:          dateLabel,
    time:          timeLabel,
  }

  // ── Chama LLM com prompt de cancelamento ─────────────────────────────────
  const systemPrompt = buildSystemPromptCancellation(profContext, appointmentInfo)
  const llmResult    = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: messageText },
    ],
    { maxTokens: 200, temperature: 0.3 },
  )

  const raw = llmResult.text.trim()

  // ── Tenta parsear JSON da resposta ───────────────────────────────────────
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { action: string }

      // ── Cancelamento confirmado ───────────────────────────────────────────
      if (parsed.action === 'cancel_confirmed') {
        await supabase
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', appointment.id)

        // Notifica profissional sobre o cancelamento (fire-and-forget)
        const { sendFromOfficialNumber } = await import('@/lib/whatsapp')
        sendFromOfficialNumber(
          prof.phone_number,
          `🔔 Cancelamento: sessão de ${appointment.protocol_name} em ${dateLabel} às ${timeLabel} foi cancelada pela cliente.`,
        ).catch((e: Error) =>
          console.error('[cancellationFlow] notificação pro cancelamento falhou:', e.message)
        )

        return {
          responseText: `Entendido! Cancelei sua sessão de ${appointment.protocol_name} do dia ${dateLabel} às ${timeLabel}. Quando quiser marcar de novo, é só falar! 💛`,
          llmProvider:  llmResult.provider,
        }
      }

      // ── Quer remarcar ─────────────────────────────────────────────────────
      if (parsed.action === 'reschedule') {
        return {
          responseText: `__reschedule__`,
          llmProvider:  llmResult.provider,
        }
      }

      // ── Mantém sessão ─────────────────────────────────────────────────────
      if (parsed.action === 'keep') {
        return {
          responseText: `Ótimo! Sua sessão de ${appointment.protocol_name} está confirmada para ${dateLabel} às ${timeLabel}. Até lá! 😊`,
          llmProvider:  llmResult.provider,
        }
      }

    } catch {
      // JSON inválido — retorna texto da LLM
    }
  }

  // Texto da LLM (parte conversacional antes do JSON)
  const textPart = raw.split('{')[0].trim()
  return {
    responseText: textPart || `Quer confirmar o cancelamento da sessão de ${appointment.protocol_name} em ${dateLabel} às ${timeLabel}?`,
    llmProvider:  llmResult.provider,
  }
}
