/**
 * /lib/ai/prompts.ts
 * Construtores de system prompts para a Lara.
 *
 * Vocabulário obrigatório (ver /docs/glossary.md):
 *   - "sessão"    em vez de "horário"
 *   - "protocolo" em vez de "serviço"
 *
 * Funções de formatação exportadas para uso no flow handler (Parte 2).
 */

// ── Tipos de contexto ─────────────────────────────────────────────────────────

export interface ProfessionalContext {
  professional_name: string
  /** 'facial' | 'corporal' | 'both' mapeado para texto humano */
  specialty_label: string
  service_mode: 'studio' | 'home' | 'both'
  service_mode_label: string
  /** Já formatado como string legível — use formatWorkingHoursForPrompt() */
  working_hours: string
  /** Já formatado — use formatProtocolsForPrompt() */
  protocols_list: string
  studio_address?: string
  /** Já formatado — use formatServiceAreasForPrompt() */
  service_areas?: string
  timezone: string
}

export interface ContactContext {
  contact_name: string | null
  lara_mode: 'full' | 'booking_only'
}

export interface BookingState {
  protocol_name?: string
  preferred_date?: string
  preferred_time?: string
  client_address?: string
  /** Número de tentativas de coleta de dados */
  attempt: number
}

export interface AppointmentInfo {
  protocol_name: string
  date: string
  time: string
}

// ── Helpers de formatação (exportados para o flow handler) ────────────────────

/** Dias da semana em pt-BR abreviado, indexados por chave ISO ('1'=Seg...'7'=Dom) */
const WEEKDAY_SHORT_PT: Record<string, string> = {
  '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb', '7': 'Dom',
}

/**
 * Converte o JSONB working_hours para string legível pelo LLM.
 * Ex: "Seg: 09:00-12:00, 14:00-18:00 | Ter: 09:00-18:00 | Sáb: Fechado"
 */
export function formatWorkingHoursForPrompt(
  workingHours: Record<string, Array<{ start: string; end: string }> | null> | null,
): string {
  if (!workingHours) return 'Não informado'

  const parts: string[] = []
  for (const [dayKey, windows] of Object.entries(workingHours)) {
    const label = WEEKDAY_SHORT_PT[dayKey] ?? dayKey
    if (!windows || windows.length === 0) {
      parts.push(`${label}: Fechado`)
    } else {
      const ranges = windows.map(w => `${w.start}-${w.end}`).join(', ')
      parts.push(`${label}: ${ranges}`)
    }
  }

  return parts.length > 0 ? parts.join(' | ') : 'Não informado'
}

/**
 * Converte o array de protocolos para string legível pelo LLM.
 * Ex: "Limpeza de pele profunda (90min, R$150) | Drenagem linfática (60min, R$120)"
 */
export function formatProtocolsForPrompt(
  protocols: Array<{ name: string; duration_min: number; price_brl: number }> | null,
): string {
  if (!protocols || protocols.length === 0) return 'Não informado'
  return protocols
    .map(p => `${p.name} (${p.duration_min}min, R$${Math.round(p.price_brl)})`)
    .join(' | ')
}

/**
 * Converte o JSONB service_areas para string legível pelo LLM.
 * Ex: "Seg: Vila Mariana, Moema | Qui: Pinheiros, Jardins"
 */
export function formatServiceAreasForPrompt(
  areas: Record<string, string[]> | null,
): string {
  if (!areas) return ''
  const parts: string[] = []
  for (const [dayKey, neighborhoods] of Object.entries(areas)) {
    const label = WEEKDAY_SHORT_PT[dayKey] ?? dayKey
    parts.push(`${label}: ${neighborhoods.join(', ')}`)
  }
  return parts.join(' | ')
}

/** Mapeia specialty enum para label pt-BR */
export function formatSpecialtyLabel(specialty: string): string {
  const map: Record<string, string> = {
    facial:   'estética facial',
    corporal: 'estética corporal',
    both:     'estética facial e corporal',
  }
  return map[specialty] ?? specialty
}

/** Mapeia service_mode para label pt-BR */
export function formatServiceModeLabel(mode: string): string {
  const map: Record<string, string> = {
    studio: 'atendimento em studio/clínica',
    home:   'atendimento em domicílio',
    both:   'atendimento em studio e domicílio',
  }
  return map[mode] ?? mode
}

// ── System prompts ─────────────────────────────────────────────────────────────

/**
 * Prompt principal para conversas gerais com clientes.
 * Usado em: modo 'full' e início de fluxos de agendamento.
 */
export function buildSystemPromptExternal(
  prof: ProfessionalContext,
  contact: ContactContext,
): string {
  const homeSection = prof.service_mode === 'home' || prof.service_mode === 'both'
    ? `\nSempre pergunte o endereço da cliente se ainda não tiver.`
    : ''

  const areasSection = (prof.service_mode === 'home' || prof.service_mode === 'both') && prof.service_areas
    ? `\nA ${prof.professional_name} atende regiões específicas por dia: ${prof.service_areas}. Se a cliente pedir dia que não cobre a região dela, ofereça outro dia disponível.`
    : ''

  const bookingOnlySection = contact.lara_mode === 'booking_only'
    ? `\nATENÇÃO: este contato está em modo agendamento. Foque em finalizar o agendamento.\nSe a conversa derivar para assuntos pessoais: "Vou avisar a ${prof.professional_name} que você quer falar com ela!"`
    : ''

  const studioSection = (prof.service_mode === 'studio' || prof.service_mode === 'both') && prof.studio_address
    ? `\n- Endereço do studio: ${prof.studio_address}`
    : ''

  const areasContextSection = (prof.service_mode === 'home' || prof.service_mode === 'both') && prof.service_areas
    ? `\n- Regiões por dia: ${prof.service_areas}`
    : ''

  return `Você é a assistente virtual da ${prof.professional_name}, esteticista especializada em ${prof.specialty_label}.
Você cuida da agenda de protocolos com carinho e eficiência.

Vocabulário obrigatório:
- Use "sessão" em vez de "horário"
- Use "protocolo" em vez de "serviço"
- Termos do nicho: limpeza de pele, drenagem linfática, massagem modeladora, radiofrequência, peeling, microagulhamento, hidratação

Modo de atendimento: ${prof.service_mode_label}${homeSection}${areasSection}

Regras absolutas:
- Responda SEMPRE em português brasileiro, informal e afetuoso
- NUNCA mencione proativamente que é IA ou robô
- Se perguntarem diretamente: confirme que é a assistente virtual da ${prof.professional_name}
- NUNCA invente protocolos, horários ou preços — use apenas o contexto abaixo
- NUNCA prometa descontos
- Máximo 3 linhas por resposta (é WhatsApp)
- Se não souber: "Deixa eu verificar com a ${prof.professional_name} e já te respondo!"
${bookingOnlySection}
Contexto:
- Profissional: ${prof.professional_name} | Especialidade: ${prof.specialty_label}
- Horários: ${prof.working_hours}
- Protocolos disponíveis: ${prof.protocols_list}${studioSection}${areasContextSection}`
}

/**
 * Prompt focado em coletar dados para completar um agendamento.
 * Usado quando intent=AGENDAR e faltam informações.
 * Responde com JSON estruturado quando todos os dados estão coletados.
 */
export function buildSystemPromptBooking(
  prof: ProfessionalContext,
  _contact: ContactContext,
  bookingState: BookingState,
): string {
  const homeAddressLine = (prof.service_mode === 'home' || prof.service_mode === 'both')
    ? `\n- Endereço da cliente: ${bookingState.client_address ?? 'não informado — PERGUNTE'}`
    : ''

  const addressJsonField = (prof.service_mode === 'home' || prof.service_mode === 'both')
    ? ',"address":"{endereco}"'
    : ''

  const handoverThreshold = bookingState.attempt > 3
    ? `\nSe tentativa > 3 e ainda faltam dados: responda com JSON:\n{"action":"handover","reason":"cliente não forneceu dados suficientes"}`
    : ''

  return `Você é a assistente da ${prof.professional_name} e está ajudando uma cliente a agendar uma sessão.

Estado atual do agendamento:
- Protocolo: ${bookingState.protocol_name ?? 'não definido ainda'}
- Data preferida: ${bookingState.preferred_date ?? 'não definida'}
- Horário preferido: ${bookingState.preferred_time ?? 'não definido'}${homeAddressLine}

Próximo passo: colete a informação que está faltando. Uma pergunta por mensagem.
Quando tiver protocolo + data + horário${(prof.service_mode === 'home' || prof.service_mode === 'both') ? ' + endereço' : ''}: responda APENAS com JSON:
{"action":"confirm","protocol":"{name}","date":"YYYY-MM-DD","time":"HH:MM"${addressJsonField}}
${handoverThreshold}
Regras: máx 2 linhas antes do JSON, português informal, nunca invente horários disponíveis.
Protocolos disponíveis: ${prof.protocols_list}
Horários de trabalho: ${prof.working_hours}`
}

/**
 * Prompt estático para classificação de intenção.
 * Responde APENAS com a categoria — sem explicação.
 * Usado em: classifyIntent() com maxTokens=10, temperature=0.
 */
export function buildSystemPromptIntentClassification(): string {
  return `Classifique a intenção da mensagem em exatamente uma categoria:
AGENDAR | CANCELAR | REMARCAR | INFORMACAO | SUPORTE | OUTRO

Responda APENAS a categoria, sem pontuação, sem explicação.`
}

/**
 * Prompt para confirmar/processar cancelamento de sessão.
 * Responde com JSON de ação após conversa de 2 linhas.
 */
export function buildSystemPromptCancellation(
  prof: ProfessionalContext,
  appointmentInfo: AppointmentInfo,
): string {
  return `Você é a assistente da ${prof.professional_name}. Uma cliente quer cancelar a sessão de ${appointmentInfo.protocol_name} em ${appointmentInfo.date} às ${appointmentInfo.time}.

Confirme o cancelamento de forma gentil, pergunte se ela quer reagendar.
Se confirmar cancelamento: {"action":"cancel_confirmed"}
Se quiser reagendar: {"action":"reschedule"}
Se mudar de ideia: {"action":"keep"}

Máximo 2 linhas antes do JSON.`
}
