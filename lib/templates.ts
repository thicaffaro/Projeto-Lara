/**
 * /lib/templates.ts
 * Gerenciamento de templates Meta WhatsApp Business (categoria UTILITY).
 *
 * ESTRUTURA:
 *   6 nomes × 3 variantes = 18 templates
 *   Variante A → mais amigável, Variante C → mais formal
 *
 * POLÍTICA DE SELEÇÃO:
 *   sendTemplate() usa primeira variante APPROVED na ordem A → B → C
 *
 * JANELA 24H:
 *   sendMessageWithFallback() usa texto livre dentro da janela Meta,
 *   template aprovado fora dela.
 *
 * TRIAL:
 *   Inicia automaticamente quando 4 nomes distintos têm ≥1 variante approved.
 *   (via handleTemplateStatusUpdate no webhook WhatsApp)
 */

import { createAdminClient } from './supabase/admin'
import { decryptToken } from './crypto'
import { graphRequest, WhatsAppApiError, sendTextMessage, sendFromOfficialNumber } from './whatsapp'

// ── Templates obrigatórios por service_mode ──────────────────────────────────
//
// studio: home_visit_confirmation NÃO é necessário (profissional não vai ao domicílio)
// home:   home_visit_confirmation É obrigatório
//
// Threshold: 80% dos obrigatórios precisam ter ≥1 variante approved para iniciar trial.
//   studio: ceil(5 × 0.80) = 4 de 5
//   home:   ceil(6 × 0.80) = 5 de 6

export const REQUIRED_TEMPLATES_BY_MODE: Record<'studio' | 'home', readonly TemplateName[]> = {
  studio: [
    'booking_confirmation',
    'reminder_24h',
    'reminder_2h',
    'cancellation',
    'reschedule_request',
  ],
  home: [
    'booking_confirmation',
    'reminder_24h',
    'reminder_2h',
    'cancellation',
    'reschedule_request',
    'home_visit_confirmation',
  ],
} as const

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type TemplateName =
  | 'booking_confirmation'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'cancellation'
  | 'reschedule_request'
  | 'home_visit_confirmation'

export type TemplateVariant = 'a' | 'b' | 'c'

export interface TemplateDefinition {
  name: TemplateName
  variant: TemplateVariant
  /** Nome registrado na Meta: "{name}_{variant}" */
  metaName: string
  /** Corpo com placeholders {{1}}, {{2}}, etc. */
  body: string
  /** Quantidade de parâmetros no corpo */
  paramCount: number
  /** Exemplos de valores para cada parâmetro (exigido pela Meta na submissão) */
  examples: readonly string[]
  category: 'UTILITY'
  language: 'pt_BR'
}

export interface SubmitResult {
  template: TemplateDefinition
  success: boolean
  metaTemplateId?: string
  error?: string
}

export interface SendTemplateResult {
  ok: boolean
  error?: 'no_approved_variant' | 'graph_api_error' | 'professional_not_found'
  message?: string
}

// ── LARA_TEMPLATES: 18 definições ────────────────────────────────────────────

export const LARA_TEMPLATES: readonly TemplateDefinition[] = [

  // ── booking_confirmation (4 params: nome, protocolo, dia, hora) ──────────
  {
    name: 'booking_confirmation', variant: 'a', metaName: 'booking_confirmation_a',
    body: 'Olá {{1}}! Sua sessão de {{2}} dia {{3}} às {{4}} está confirmada. Qualquer alteração é só me avisar. Obrigada! 💛',
    paramCount: 4, examples: ['Ana', 'Limpeza de pele', '15/01', '14h'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'booking_confirmation', variant: 'b', metaName: 'booking_confirmation_b',
    body: 'Olá {{1}}, confirmando sua sessão de {{2}} para {{3}} às {{4}}. Avise-me se precisar alterar.',
    paramCount: 4, examples: ['Ana', 'Limpeza de pele', '15/01', '14h'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'booking_confirmation', variant: 'c', metaName: 'booking_confirmation_c',
    body: 'Confirmação de agendamento: {{1}}, sua sessão de {{2}} está marcada para {{3}} às {{4}}.',
    paramCount: 4, examples: ['Ana', 'Limpeza de pele', '15/01', '14h'],
    category: 'UTILITY', language: 'pt_BR',
  },

  // ── reminder_24h (3 params: nome, hora, protocolo) ───────────────────────
  {
    name: 'reminder_24h', variant: 'a', metaName: 'reminder_24h_a',
    body: 'Oi {{1}}! Lembrete: amanhã às {{2}} tem sua sessão de {{3}}. Te espero! ✨',
    paramCount: 3, examples: ['Ana', '14h', 'Limpeza de pele'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'reminder_24h', variant: 'b', metaName: 'reminder_24h_b',
    body: 'Olá {{1}}, lembrando da sua sessão de {{3}} amanhã às {{2}}.',
    paramCount: 3, examples: ['Ana', '14h', 'Limpeza de pele'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'reminder_24h', variant: 'c', metaName: 'reminder_24h_c',
    body: '{{1}}, lembrete da sessão de {{3}} agendada para amanhã às {{2}}.',
    paramCount: 3, examples: ['Ana', '14h', 'Limpeza de pele'],
    category: 'UTILITY', language: 'pt_BR',
  },

  // ── reminder_2h (2 params: nome, protocolo) ──────────────────────────────
  {
    name: 'reminder_2h', variant: 'a', metaName: 'reminder_2h_a',
    body: 'Oi {{1}}! Sua sessão de {{2}} é em 2 horinhas. Já tô preparando tudo pra você! 💛',
    paramCount: 2, examples: ['Ana', 'Limpeza de pele'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'reminder_2h', variant: 'b', metaName: 'reminder_2h_b',
    body: 'Olá {{1}}, sua sessão de {{2}} começa em 2 horas.',
    paramCount: 2, examples: ['Ana', 'Limpeza de pele'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'reminder_2h', variant: 'c', metaName: 'reminder_2h_c',
    body: '{{1}}, lembrete da sessão de {{2}} marcada para daqui a 2 horas.',
    paramCount: 2, examples: ['Ana', 'Limpeza de pele'],
    category: 'UTILITY', language: 'pt_BR',
  },

  // ── cancellation (3 params: nome, protocolo, dia) ────────────────────────
  {
    name: 'cancellation', variant: 'a', metaName: 'cancellation_a',
    body: 'Oi {{1}}, recebi seu cancelamento da sessão de {{2}} dia {{3}}. Quando quiser remarcar, é só me chamar! 💛',
    paramCount: 3, examples: ['Ana', 'Limpeza de pele', '15/01'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'cancellation', variant: 'b', metaName: 'cancellation_b',
    body: 'Olá {{1}}, sua sessão de {{2}} dia {{3}} foi cancelada. Para remarcar, entre em contato.',
    paramCount: 3, examples: ['Ana', 'Limpeza de pele', '15/01'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'cancellation', variant: 'c', metaName: 'cancellation_c',
    body: '{{1}}, confirmação de cancelamento da sessão de {{2}} agendada para {{3}}.',
    paramCount: 3, examples: ['Ana', 'Limpeza de pele', '15/01'],
    category: 'UTILITY', language: 'pt_BR',
  },

  // ── reschedule_request (4 params: nome, protocolo, diaAntigo, novoDia) ───
  {
    name: 'reschedule_request', variant: 'a', metaName: 'reschedule_request_a',
    body: 'Oi {{1}}! Sua sessão de {{2}} dia {{3}} foi remarcada para {{4}}. Qualquer dúvida, me chama! 💛',
    paramCount: 4, examples: ['Ana', 'Limpeza de pele', '15/01', '17/01 às 15h'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'reschedule_request', variant: 'b', metaName: 'reschedule_request_b',
    body: 'Olá {{1}}, sua sessão de {{2}} foi remarcada de {{3}} para {{4}}.',
    paramCount: 4, examples: ['Ana', 'Limpeza de pele', '15/01', '17/01 às 15h'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'reschedule_request', variant: 'c', metaName: 'reschedule_request_c',
    body: '{{1}}, alteração confirmada: sessão de {{2}} remarcada para {{4}}.',
    paramCount: 4, examples: ['Ana', 'Limpeza de pele', '15/01', '17/01 às 15h'],
    category: 'UTILITY', language: 'pt_BR',
  },

  // ── home_visit_confirmation (5 params: nome, protocolo, dia, hora, endereço) ──
  {
    name: 'home_visit_confirmation', variant: 'a', metaName: 'home_visit_confirmation_a',
    body: 'Oi {{1}}! Confirmando minha visita pra sua sessão de {{2}} dia {{3}} às {{4}} no endereço {{5}}. Te vejo lá! 💛',
    paramCount: 5, examples: ['Ana', 'Drenagem linfática', '15/01', '14h', 'Rua das Flores, 123'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'home_visit_confirmation', variant: 'b', metaName: 'home_visit_confirmation_b',
    body: 'Olá {{1}}, confirmação da visita domiciliar para sessão de {{2}} em {{3}} às {{4}} no endereço {{5}}.',
    paramCount: 5, examples: ['Ana', 'Drenagem linfática', '15/01', '14h', 'Rua das Flores, 123'],
    category: 'UTILITY', language: 'pt_BR',
  },
  {
    name: 'home_visit_confirmation', variant: 'c', metaName: 'home_visit_confirmation_c',
    body: '{{1}}, visita domiciliar confirmada: {{2}} em {{3}} às {{4}}, endereço {{5}}.',
    paramCount: 5, examples: ['Ana', 'Drenagem linfática', '15/01', '14h', 'Rua das Flores, 123'],
    category: 'UTILITY', language: 'pt_BR',
  },
]

// ── TEMPLATE_FALLBACKS: textos livres para janela 24h ─────────────────────────
// Usados APENAS quando is_within_meta_window() = true.
// Evitam custo de template; mantêm tom natural da conversa.

export const TEMPLATE_FALLBACKS = {
  booking_confirmation: (
    nome: string, protocolo: string, dia: string, hora: string,
  ): string =>
    `Olá ${nome}! Sua sessão de ${protocolo} dia ${dia} às ${hora} está confirmada. Qualquer alteração é só me avisar. Obrigada!`,

  reminder_24h: (nome: string, hora: string, protocolo: string): string =>
    `Oi ${nome}! Lembrete: amanhã às ${hora} tem sua sessão de ${protocolo}. Te espero!`,

  reminder_2h: (nome: string, protocolo: string): string =>
    `Oi ${nome}! Sua sessão de ${protocolo} é em 2 horinhas. Já tô preparando tudo pra você!`,

  cancellation: (nome: string, protocolo: string, dia: string): string =>
    `Oi ${nome}, recebi seu cancelamento da sessão de ${protocolo} dia ${dia}. Quando quiser remarcar, é só me chamar!`,

  reschedule_request: (
    nome: string, protocolo: string, diaAntigo: string, novoDia: string,
  ): string =>
    `Oi ${nome}! Sua sessão de ${protocolo} dia ${diaAntigo} foi remarcada para ${novoDia}. Qualquer dúvida, me chama!`,

  home_visit_confirmation: (
    nome: string, protocolo: string, dia: string, hora: string, endereco: string,
  ): string =>
    `Oi ${nome}! Confirmando minha visita pra sua sessão de ${protocolo} dia ${dia} às ${hora} no endereço ${endereco}. Te vejo lá!`,
} as const satisfies Record<TemplateName, (...args: string[]) => string>

// ── Helper: verificação de janela Meta via RPC ────────────────────────────────

async function checkMetaWindow(contactId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('is_within_meta_window', {
    p_contact_id: contactId,
  })
  if (error) {
    console.error('[templates] is_within_meta_window RPC falhou:', error.message)
    return false // default seguro: assume fora da janela (exige template)
  }
  return Boolean(data)
}

// ── Helper: sleep com suporte a Retry-After ───────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── submitAllTemplates ────────────────────────────────────────────────────────

/**
 * Submete os 18 templates à Meta para a WABA do profissional.
 *
 * - Sequencial com 200ms de espaçamento (rate limit Meta: 100/dia por WABA)
 * - Retry com backoff exponencial em 429: 2s → 4s → 8s (máx 3 tentativas)
 * - Respeita header Retry-After quando presente
 * - Salva resultado em tabela templates após cada submissão
 * - Trial NÃO inicia aqui — apenas registra submitted_at
 *
 * @param professionalId - ID do profissional no banco
 * @returns Array de SubmitResult (um por template, incluindo falhas)
 */
export async function submitAllTemplates(
  professionalId: string,
): Promise<SubmitResult[]> {
  const supabase = createAdminClient()

  // Busca dados do profissional
  const { data: professional, error: fetchError } = await supabase
    .from('professionals')
    .select('meta_waba_id, access_token_encrypted')
    .eq('id', professionalId)
    .single()

  if (fetchError || !professional?.meta_waba_id || !professional?.access_token_encrypted) {
    console.error('[templates] submitAllTemplates: profissional não encontrado ou sem WABA:', professionalId)
    return LARA_TEMPLATES.map(t => ({
      template: t,
      success: false,
      error: 'professional_not_found',
    }))
  }

  // Decriptografa token — usar imediatamente, não armazenar
  let accessToken: string
  try {
    // non-null asserted: guard acima garante que não é null
    accessToken = await decryptToken(professional.access_token_encrypted!)
  } catch {
    console.error('[templates] submitAllTemplates: falha ao decriptografar token:', professionalId)
    return LARA_TEMPLATES.map(t => ({
      template: t,
      success: false,
      error: 'token_decryption_failed',
    }))
  }

  const wabaId = professional.meta_waba_id
  const results: SubmitResult[] = []

  for (const template of LARA_TEMPLATES) {
    const result = await submitSingleTemplate(
      template, accessToken, wabaId, professionalId,
    )
    results.push(result)

    // Persiste resultado no banco independente de sucesso/falha
    await persistTemplateResult(template, result, professionalId, supabase)

    // Espaçamento mínimo de 200ms entre submissões (rate limit Meta)
    await sleep(200)
  }

  // Zera token após uso
  ;(accessToken as any) = null

  return results
}

// ── submitSingleTemplate (com retry) ─────────────────────────────────────────

const MAX_RETRIES = 3
const BACKOFF_BASE_MS = 2_000

async function submitSingleTemplate(
  template: TemplateDefinition,
  accessToken: string,
  wabaId: string,
  professionalId: string,
  attempt = 0,
): Promise<SubmitResult> {
  const payload = {
    name: template.metaName,
    language: template.language,
    category: template.category,
    components: [
      {
        type: 'BODY',
        text: template.body,
        // Meta exige exemplos para templates com variáveis
        ...(template.paramCount > 0 ? {
          example: { body_text: [template.examples] },
        } : {}),
      },
    ],
  }

  try {
    const { data } = await graphRequest<{ id: string }>(
      `/${wabaId}/message_templates`,
      { method: 'POST', token: accessToken, body: payload },
      professionalId,
    )

    return {
      template,
      success: true,
      metaTemplateId: data.id,
    }

  } catch (err) {
    if (!(err instanceof WhatsAppApiError)) {
      return { template, success: false, error: 'unexpected_error' }
    }

    // ── Retry em 429 (rate limit) ─────────────────────────────────────────
    if (err.code === 429 && attempt < MAX_RETRIES) {
      // Prioridade: Retry-After exato da Meta (em segundos via err.retryAfter)
      // Fallback: backoff exponencial 2s → 4s → 8s
      // CRÍTICO: ignorar Retry-After pode resultar em ban do WABA
      const retryAfterMs = err.retryAfter != null
        ? err.retryAfter * 1000
        : BACKOFF_BASE_MS * Math.pow(2, attempt)

      console.warn(
        `[templates] Rate limit Meta (429) para ${template.metaName} — `
        + `aguardando ${retryAfterMs / 1000}s `
        + `(${err.retryAfter != null ? 'Retry-After da Meta' : 'backoff exponencial'})`
        + ` tentativa ${attempt + 1}/${MAX_RETRIES}`
      )
      await sleep(retryAfterMs)
      return submitSingleTemplate(template, accessToken, wabaId, professionalId, attempt + 1)
    }

    // ── 3 retries esgotados ou erro não-429 ───────────────────────────────
    if (err.code === 429 && attempt >= MAX_RETRIES) {
      console.error(
        `[templates] Rate limit esgotado para ${template.metaName} após ${MAX_RETRIES} tentativas.`
        + ` Marcar como failed e logar em audit_log.`
      )
    }

    return {
      template,
      success: false,
      error: `graph_api_error_${err.code}`,
    }
  }
}

// ── Persistência do resultado no banco ───────────────────────────────────────

async function persistTemplateResult(
  template: TemplateDefinition,
  result: SubmitResult,
  professionalId: string,
  supabase: any,
): Promise<void> {
  const now = new Date().toISOString()

  const upsertData = {
    professional_id:  professionalId,
    name:             template.name,
    variant:          template.variant,
    status:           result.success ? 'pending' : 'rejected',
    submitted_at:     result.success ? now : null,
    meta_template_id: result.metaTemplateId ?? null,
    rejection_reason: result.success ? null : result.error ?? 'submission_failed',
  }

  const { error } = await supabase
    .from('templates')
    .upsert(upsertData, { onConflict: 'professional_id,name,variant' })

  if (error) {
    console.error('[templates] Falha ao persistir template:', error.message,
      'template:', template.metaName, 'professional:', professionalId)
  }

  // Se falha por esgotamento de retries, logar em audit_log
  if (!result.success && result.error?.includes('rate_limit')) {
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'system',
      action: 'template_submission_rate_limit_exhausted',
      table_name: 'templates',
      new_data: { template_name: template.metaName, error: result.error },
    }).catch((e: Error) =>
      console.error('[templates] audit_log INSERT falhou:', e.message)
    )
  }
}

// ── sendTemplate ──────────────────────────────────────────────────────────────

/**
 * Envia um template aprovado para o contato.
 * Seleciona automaticamente a primeira variante APPROVED na ordem A → B → C.
 *
 * @param professionalId - ID do profissional
 * @param templateName   - Nome do template (6 opções)
 * @param toPhoneNumber  - Número do destinatário (apenas dígitos)
 * @param params         - Valores para {{1}}, {{2}}, etc. na ordem correta
 */
export async function sendTemplate(
  professionalId: string,
  templateName: TemplateName,
  toPhoneNumber: string,
  params: readonly string[],
): Promise<SendTemplateResult> {
  const supabase = createAdminClient()

  // ── 1. Buscar primeira variante APPROVED na ordem A → B → C ───────────────
  const { data: approvedTemplates, error: fetchError } = await supabase
    .from('templates')
    .select('id, name, variant, meta_template_id, status')
    .eq('professional_id', professionalId)
    .eq('name', templateName)
    .eq('status', 'approved')
    .order('variant', { ascending: true })
    .limit(3)

  if (fetchError) {
    console.error('[templates] sendTemplate: falha ao buscar templates:', fetchError.message)
    return { ok: false, error: 'graph_api_error' }
  }

  const chosen = (approvedTemplates ?? []).find(t =>
    ['a', 'b', 'c'].includes(t.variant)
  )

  if (!chosen) {
    // Nenhuma variante aprovada — logar em audit_log e notificar equipe de ops
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'system',
      action: 'template_no_variant_available',
      table_name: 'templates',
      new_data: { template_name: templateName, to: toPhoneNumber.slice(-4) + '****' },
    }).then(null, (e: Error) =>
      console.error('[templates] audit_log INSERT falhou:', e.message)
    )

    // Notifica equipe ops via número oficial Lara
    // LARA_OPS_PHONE: número do grupo/agente de ops (default: LARA_OFFICIAL_PHONE)
    const opsPhone = process.env.LARA_OPS_PHONE ?? process.env.LARA_OFFICIAL_PHONE ?? ''
    if (opsPhone) {
      // Busca nome da profissional para a mensagem de alerta
      const { data: prof } = await supabase
        .from('professionals')
        .select('name, phone_number')
        .eq('id', professionalId)
        .single()

      const profName = prof?.name ?? `ID ${professionalId}`
      sendFromOfficialNumber(
        opsPhone,
        `⚠️ Profissional ${profName} não tem variante aprovada para o template "${templateName}". `
        + `Verificar em /admin/ops/templates.`,
      ).catch((e: Error) =>
        console.error('[templates] Falha ao notificar ops sobre no_variant_available:', e.message)
      )
    }

    return { ok: false, error: 'no_approved_variant' }
  }

  // ── 2. Buscar phone_number_id e token do profissional ─────────────────────
  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('meta_phone_number_id, access_token_encrypted')
    .eq('id', professionalId)
    .single()

  if (profError || !professional?.meta_phone_number_id) {
    return { ok: false, error: 'professional_not_found' }
  }

  if (!professional.access_token_encrypted) {
    return { ok: false, error: 'graph_api_error', message: 'Token de acesso ausente' }
  }

  let accessToken: string
  try {
    accessToken = await decryptToken(professional.access_token_encrypted)
  } catch {
    return { ok: false, error: 'graph_api_error', message: 'Falha ao autenticar' }
  }

  // ── 3. Construir payload e enviar ─────────────────────────────────────────
  const templateDef = LARA_TEMPLATES.find(
    t => t.name === templateName && t.variant === chosen.variant
  )

  try {
    await graphRequest(
      `/${professional.meta_phone_number_id}/messages`,
      {
        method: 'POST',
        token: accessToken,
        body: {
          messaging_product: 'whatsapp',
          to: toPhoneNumber.replace(/\D/g, ''),
          type: 'template',
          template: {
            name: templateDef?.metaName ?? `${templateName}_${chosen.variant}`,
            language: { code: 'pt_BR' },
            components: params.length > 0 ? [{
              type: 'body',
              parameters: params.map(p => ({ type: 'text', text: p })),
            }] : [],
          },
        },
      },
      professionalId,
    )

    return { ok: true }

  } catch (err) {
    const msg = err instanceof WhatsAppApiError ? err.message : 'Erro ao enviar template'
    return { ok: false, error: 'graph_api_error', message: msg }
  } finally {
    ;(accessToken as any) = null
  }
}

// ── sendMessageWithFallback ───────────────────────────────────────────────────

export interface SendWithFallbackParams {
  professionalId: string
  contactId: string
  toPhoneNumber: string
  templateName: TemplateName
  /** Params ordenados para {{1}}, {{2}}, etc. no template */
  templateParams: readonly string[]
  /**
   * Texto já renderizado via TEMPLATE_FALLBACKS.
   * O caller é responsável por chamar a função de fallback correta.
   * Ex: TEMPLATE_FALLBACKS.booking_confirmation('Ana', 'Limpeza de pele', '15/01', '14h')
   */
  fallbackText: string
}

/**
 * Decide automaticamente entre texto livre (dentro da janela 24h) ou
 * template aprovado (fora da janela).
 *
 * Dentro da janela: mais barato, tom mais natural, sem restrição de formato.
 * Fora da janela: exige template aprovado pela Meta (obrigatório por políticas).
 *
 * Ver /docs/templates.md para diagrama de decisão.
 */
export async function sendMessageWithFallback(
  params: SendWithFallbackParams,
): Promise<{ ok: boolean; method: 'free_text' | 'template' | 'failed'; error?: string }> {
  const {
    professionalId, contactId, toPhoneNumber,
    templateName, templateParams, fallbackText,
  } = params

  const supabase = createAdminClient()

  // Busca phone_number_id e token
  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('meta_phone_number_id, access_token_encrypted')
    .eq('id', professionalId)
    .single()

  if (profError || !professional?.meta_phone_number_id) {
    return { ok: false, method: 'failed', error: 'professional_not_found' }
  }

  if (!professional.access_token_encrypted) {
    return { ok: false, method: 'failed', error: 'token_missing' }
  }

  // ── Verifica janela Meta via RPC is_within_meta_window ────────────────────
  const withinWindow = await checkMetaWindow(contactId)

  if (withinWindow) {
    // ── Dentro da janela: texto livre ────────────────────────────────────
    let accessToken: string
    try {
      accessToken = await decryptToken(professional.access_token_encrypted)
    } catch {
      return { ok: false, method: 'failed', error: 'token_decryption_failed' }
    }

    try {
      await sendTextMessage(
        professional.meta_phone_number_id,
        accessToken,
        toPhoneNumber,
        fallbackText,
        professionalId,
      )
      return { ok: true, method: 'free_text' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar texto'
      return { ok: false, method: 'failed', error: msg }
    } finally {
      ;(accessToken as any) = null
    }
  }

  // ── Fora da janela: template aprovado ────────────────────────────────────
  const templateResult = await sendTemplate(
    professionalId, templateName, toPhoneNumber, templateParams,
  )

  if (templateResult.error === 'no_approved_variant') {
    // Logar impossibilidade de comunicação
    await supabase.from('audit_log').insert({
      professional_id: professionalId,
      actor: 'system',
      action: 'window_expired_no_template',
      table_name: 'templates',
      new_data: {
        template_name: templateName,
        contact_id: contactId,
        note: 'Janela 24h expirada e nenhuma variante aprovada disponível',
      },
    }).then(null, (e: Error) =>
      console.error('[templates] audit_log INSERT falhou:', e.message)
    )
    return { ok: false, method: 'failed', error: 'cannot_send_outside_window' }
  }

  return templateResult.ok
    ? { ok: true, method: 'template' }
    : { ok: false, method: 'failed', error: templateResult.message }
}

// ── handleTemplateStatusUpdate (chamado pelo webhook WhatsApp) ────────────────

export interface TemplateStatusUpdateValue {
  event: 'APPROVED' | 'REJECTED' | 'DISABLED' | 'IN_APPEAL' | 'PENDING'
  message_template_id: number
  message_template_name: string
  message_template_language: string
  reason?: string
}

/**
 * Processa atualização de status de template recebida via webhook.
 * Atualiza a tabela templates e verifica se o trial pode iniciar.
 *
 * Chamado diretamente no handler do webhook (síncrono antes do 200).
 */
export async function handleTemplateStatusUpdate(
  value: TemplateStatusUpdateValue,
  wabaId: string,
): Promise<void> {
  const supabase = createAdminClient()

  // ── Mapeia status Meta → template_status do banco ─────────────────────────
  const STATUS_MAP: Record<string, import('./supabase/types').TemplateStatus> = {
    APPROVED:  'approved',
    REJECTED:  'rejected',
    DISABLED:  'paused',
    IN_APPEAL: 'pending',
    PENDING:   'pending',
  }

  const newStatus: import('./supabase/types').TemplateStatus = STATUS_MAP[value.event] ?? 'pending'
  const metaName  = value.message_template_name // ex: "booking_confirmation_a"
  const metaId    = String(value.message_template_id)

  // Extrai variant do nome (último caractere: a, b ou c)
  const variantChar = metaName.slice(-1) as TemplateVariant
  const templateBaseName = metaName.slice(0, -2) as TemplateName

  // ── Busca o profissional pelo WABA ID ─────────────────────────────────────
  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('id')
    .eq('meta_waba_id', wabaId)
    .maybeSingle()

  if (profError || !professional) {
    console.error('[templates] handleTemplateStatusUpdate: WABA não encontrado:', wabaId)
    return
  }

  const professionalId = professional.id

  // ── Atualiza o template no banco ──────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('templates')
    .update({
      status:          newStatus,
      meta_template_id: metaId,
      ...(newStatus === 'approved' ? { approved_at: new Date().toISOString() } : {}),
      ...(newStatus === 'rejected' && value.reason
        ? { rejection_reason: value.reason }
        : {}),
    })
    .eq('professional_id', professionalId)
    .eq('name', templateBaseName)
    .eq('variant', variantChar)

  if (updateError) {
    console.error('[templates] Falha ao atualizar status do template:',
      updateError.message, 'template:', metaName)
    return
  }

  console.log(
    `[templates] Status atualizado — professional: ${professionalId}, `
    + `template: ${metaName}, status: ${newStatus}`
  )

  // ── Verifica se o trial pode iniciar ────────────────────────────────────
  // Condição: 4 nomes DISTINTOS com pelo menos 1 variante 'approved'
  if (newStatus === 'approved') {
    await maybeStartTrial(professionalId)
  }
}

// ── maybeStartTrial ───────────────────────────────────────────────────────────

/**
 * Inicia o trial quando 80% dos templates obrigatórios para o service_mode
 * da profissional têm ≥1 variante approved.
 *
 * Regras por service_mode:
 *   studio: 4 de 5 obrigatórios (home_visit_confirmation ignorado)
 *   home:   5 de 6 obrigatórios (home_visit_confirmation incluído)
 *
 * Contagem:
 *   SQL filtra por (professional_id, status='approved', name IN obrigatórios)
 *   Set elimina duplicatas de nome — garante COUNT(DISTINCT name)
 *   Threshold = ceil(total_obrigatórios × 0.80)
 *
 * Idempotente: só atua se trial_started_at ainda for NULL.
 */
async function maybeStartTrial(professionalId: string): Promise<void> {
  const supabase = createAdminClient()

  // ── 1. Busca professional para service_mode + idempotência ────────────────
  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('trial_started_at, phone_number, name, service_mode')
    .eq('id', professionalId)
    .single()

  if (profError || !professional) return

  // Idempotência: trial já iniciado
  if (professional.trial_started_at) return

  // ── 2. Determina templates obrigatórios e threshold para este service_mode ─
  const mode = (professional.service_mode ?? 'studio') as 'studio' | 'home'
  const requiredNames = REQUIRED_TEMPLATES_BY_MODE[mode]
  const threshold = Math.ceil(requiredNames.length * 0.8)
  // studio: ceil(5 × 0.80) = 4    home: ceil(6 × 0.80) = 5

  // ── 3. Conta nomes distintos aprovados dentro dos obrigatórios ────────────
  // Equivale a: SELECT COUNT(DISTINCT name) FROM templates
  //             WHERE professional_id=$1 AND status='approved' AND name=ANY($2)
  const { data: approvedRows, error: countError } = await supabase
    .from('templates')
    .select('name')
    .eq('professional_id', professionalId)
    .eq('status', 'approved')
    .in('name', requiredNames as unknown as string[])

  if (countError || !approvedRows) return

  // Set deduplica: booking_confirmation com variantes A+B aprovadas conta como 1
  const distinctApprovedCount = new Set(approvedRows.map(t => t.name)).size

  if (distinctApprovedCount < threshold) {
    console.log(
      `[templates] Trial não elegível — ${distinctApprovedCount}/${threshold} `
      + `nomes aprovados (mode=${mode}) — professional: ${professionalId}`
    )
    return
  }

  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // ── Inicia trial no professional ────────────────────────────────────────
  await supabase
    .from('professionals')
    .update({
      trial_started_at: now.toISOString(),
      trial_ends_at:    trialEndsAt.toISOString(),
    })
    .eq('id', professionalId)

  // ── Atualiza subscription para 'trial' ───────────────────────────────────
  await supabase
    .from('subscriptions')
    .upsert(
      {
        professional_id: professionalId,
        status: 'trial',
        // cancelled_at intencionalmente NULL — não é cancelamento
      },
      { onConflict: 'professional_id' },
    )

  console.log(
    `[templates] Trial iniciado — professional: ${professionalId}, `
    + `mode: ${mode}, threshold: ${distinctApprovedCount}/${threshold}, `
    + `ends_at: ${trialEndsAt.toISOString()}`
  )

  // ── Notifica profissional via número oficial Lara ─────────────────────────
  if (professional) {
    try {
      await sendFromOfficialNumber(
        professional.phone_number,
        `Ótima notícia, ${professional.name}! Seus templates foram aprovados e seu período de teste `
        + `de 7 dias começou agora. A Lara já está pronta para gerenciar seus agendamentos. `
        + `Acesse ${process.env.NEXT_PUBLIC_APP_URL}/onboarding/setup para finalizar a configuração.`,
      )
    } catch (notifyErr) {
      const msg = notifyErr instanceof Error ? notifyErr.message : 'erro'
      console.error('[templates] Falha ao notificar início do trial:', msg)
      // Notificação falhou mas trial foi iniciado — não reverter
    }
  }
}
