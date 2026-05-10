/**
 * /lib/whatsapp.ts
 * Wrapper para a WhatsApp Business Cloud API (Meta Graph API).
 *
 * RESPONSABILIDADES PRINCIPAIS:
 * 1. Todas as chamadas à Graph API passam por graphRequest()
 * 2. OAuthException code=190 (token inválido) é detectado em toda chamada
 * 3. Ao detectar code=190:
 *    - UPDATE professionals SET whatsapp_status='token_invalid'
 *    - Notificar profissional via número oficial Lara
 *    - Bloquear automações até reconexão
 *
 * SEGURANÇA:
 * - access_token NUNCA aparece em logs ou mensagens de erro
 * - Erros da Graph API são mascarados antes de serem relançados
 */

import { createAdminClient } from './supabase/admin'
import { decryptToken } from './crypto'

// ── Constantes ────────────────────────────────────────────────────────────────

const GRAPH_BASE = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v19.0'}`
const LARA_OFFICIAL_PHONE = process.env.LARA_OFFICIAL_PHONE ?? '+5511978663056'
const LARA_OFFICIAL_PHONE_ID = process.env.LARA_OFFICIAL_PHONE_ID ?? ''
const LARA_OFFICIAL_ACCESS_TOKEN = process.env.LARA_OFFICIAL_ACCESS_TOKEN ?? ''

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface GraphError {
  message: string
  type: string
  code: number
  error_subcode?: number
  fbtrace_id?: string
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly isTokenInvalid: boolean,
  ) {
    super(message)
    this.name = 'WhatsAppApiError'
  }
}

// ── Núcleo: graphRequest ──────────────────────────────────────────────────────

interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  token: string
  body?: Record<string, unknown>
  timeoutMs?: number
}

/**
 * Faz uma requisição à Graph API.
 * Em toda chamada, detecta OAuthException code=190 e aciona tratamento.
 *
 * @param path     - Caminho relativo ao endpoint (ex: "/123456/messages")
 * @param options  - Método, token e body
 * @param professionalId - Necessário para acionar tratamento de token_invalid
 */
export async function graphRequest<T = unknown>(
  path: string,
  options: GraphRequestOptions,
  professionalId?: string,
): Promise<T> {
  const { method = 'GET', token, body, timeoutMs = 10_000 } = options

  const url = `${GRAPH_BASE}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : 'Timeout ou falha de rede'
    throw new WhatsAppApiError(`Falha na requisição Graph API: ${msg}`, 0, false)
  } finally {
    clearTimeout(timer)
  }

  const json = await response.json().catch(() => ({}))

  if (!response.ok || json?.error) {
    const graphErr = json?.error as GraphError | undefined
    const code = graphErr?.code ?? response.status

    // OAuthException code=190 → token inválido
    if (code === 190) {
      if (professionalId) {
        // Fire-and-forget — não bloqueia o lançamento do erro
        handleTokenInvalid(professionalId).catch(e =>
          console.error('[whatsapp] handleTokenInvalid falhou:', e?.message)
        )
      }
      throw new WhatsAppApiError(
        'Token de acesso Meta inválido ou expirado (code=190)',
        190,
        true,
      )
    }

    // Outros erros — sem expor detalhes internos
    const safeMsg = graphErr?.message
      ? `Graph API error ${code}: ${graphErr.message}`
      : `Graph API retornou status ${response.status}`

    throw new WhatsAppApiError(safeMsg, code, false)
  }

  return json as T
}

// ── Tratamento de token inválido ──────────────────────────────────────────────

/**
 * Chamado quando code=190 é detectado:
 * 1. Marca whatsapp_status='token_invalid' (trigger updated_at automático)
 * 2. Notifica profissional via número oficial Lara
 */
async function handleTokenInvalid(professionalId: string): Promise<void> {
  const supabase = createAdminClient()

  // Busca dados do profissional para notificação
  const { data: professional, error } = await supabase
    .from('professionals')
    .select('id, name, phone_number, whatsapp_status')
    .eq('id', professionalId)
    .single()

  if (error || !professional) {
    console.error('[whatsapp] handleTokenInvalid: profissional não encontrado:', professionalId)
    return
  }

  // Já estava como token_invalid — evita atualização duplicada
  if (professional.whatsapp_status === 'token_invalid') return

  // Atualiza status (trigger whatsapp_status_changed_at dispara automaticamente)
  const { error: updateError } = await supabase
    .from('professionals')
    .update({ whatsapp_status: 'token_invalid' })
    .eq('id', professionalId)

  if (updateError) {
    console.error('[whatsapp] handleTokenInvalid: falha ao atualizar status:', updateError.message)
    return
  }

  console.log(
    `[whatsapp] Token inválido detectado — profissional ${professionalId} notificado.`
  )

  // Notifica profissional via número oficial Lara
  // Usa try-catch para não bloquear o fluxo se a notificação falhar
  try {
    await sendFromOfficialNumber(
      professional.phone_number,
      `Olá ${professional.name}! A conexão da Lara com seu WhatsApp expirou. ` +
        `Acesse o painel para reconectar: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/lara`,
    )
  } catch (notifyErr) {
    const msg = notifyErr instanceof Error ? notifyErr.message : 'erro desconhecido'
    console.error('[whatsapp] Falha ao notificar profissional sobre token inválido:', msg)
    // Notificação falhou mas status já foi atualizado — não relançar
  }
}

// ── Envio de mensagem pelo número oficial Lara ────────────────────────────────

/**
 * Envia uma mensagem de texto pelo número oficial da Lara (+5511978663056).
 * Usado para notificações operacionais como token inválido.
 */
export async function sendFromOfficialNumber(
  toPhoneNumber: string,
  text: string,
): Promise<void> {
  if (!LARA_OFFICIAL_PHONE_ID || !LARA_OFFICIAL_ACCESS_TOKEN) {
    console.warn('[whatsapp] LARA_OFFICIAL_PHONE_ID ou ACCESS_TOKEN não configurados — notificação ignorada')
    return
  }

  await graphRequest(
    `/${LARA_OFFICIAL_PHONE_ID}/messages`,
    {
      method: 'POST',
      token: LARA_OFFICIAL_ACCESS_TOKEN,
      body: {
        messaging_product: 'whatsapp',
        to: toPhoneNumber.replace(/\D/g, ''),
        type: 'text',
        text: { body: text },
      },
    },
  )
}

// ── Funções de uso nos API routes ─────────────────────────────────────────────

/** Troca code OAuth por access_token de curta duração */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string
  tokenType: string
}> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    code,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/onboarding/callback`,
  })

  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?${params.toString()}`,
    { method: 'GET' },
  )

  const json = await res.json()
  if (json.error || !json.access_token) {
    // Não logar o code pois pode vazar informações do OAuth
    throw new WhatsAppApiError(
      `Falha ao trocar code por token: ${json.error?.message ?? 'resposta inválida'}`,
      json.error?.code ?? res.status,
      false,
    )
  }

  return { accessToken: json.access_token, tokenType: json.token_type ?? 'bearer' }
}

/** Troca token de curta duração por token de longa duração (~60 dias) */
export async function exchangeForLongLivedToken(shortToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  })

  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  const json = await res.json()

  if (json.error || !json.access_token) {
    throw new WhatsAppApiError(
      `Falha ao obter token de longa duração: ${json.error?.message ?? 'resposta inválida'}`,
      json.error?.code ?? res.status,
      false,
    )
  }

  return json.access_token as string
}

/** Registra número de telefone via Graph API */
export async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  professionalId: string,
): Promise<void> {
  await graphRequest(
    `/${phoneNumberId}/register`,
    {
      method: 'POST',
      token: accessToken,
      body: { messaging_product: 'whatsapp', pin: '000000' },
    },
    professionalId,
  )
}

/** Solicita código de verificação por SMS ou ligação */
export async function requestVerificationCode(
  phoneNumberId: string,
  accessToken: string,
  method: 'SMS' | 'VOICE',
  professionalId: string,
): Promise<void> {
  await graphRequest(
    `/${phoneNumberId}/request_code`,
    {
      method: 'POST',
      token: accessToken,
      body: { code_method: method, language: 'pt_BR' },
    },
    professionalId,
  )
}

/** Verifica código de 6 dígitos com a Meta */
export async function verifyPhoneCode(
  phoneNumberId: string,
  accessToken: string,
  code: string,
  professionalId: string,
): Promise<void> {
  await graphRequest(
    `/${phoneNumberId}/verify_code`,
    {
      method: 'POST',
      token: accessToken,
      body: { code },
    },
    professionalId,
  )
}

/**
 * Utilitário para obter o access_token decriptografado de um profissional.
 * Usar imediatamente; nunca armazenar o resultado.
 */
export async function getProfessionalToken(professionalId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('professionals')
    .select('access_token_encrypted, meta_phone_number_id')
    .eq('id', professionalId)
    .single()

  if (error || !data?.access_token_encrypted) {
    throw new Error('Token de acesso não encontrado para este profissional')
  }

  return decryptToken(data.access_token_encrypted)
}

// ── Envio de texto livre pelo número do profissional ─────────────────────────

/**
 * Envia uma mensagem de texto pelo número da própria profissional.
 * Usar APENAS dentro da janela de 24h (is_within_meta_window = true).
 * Fora da janela, usar sendTemplate via /lib/templates.ts.
 *
 * @param phoneNumberId   - meta_phone_number_id da profissional
 * @param accessToken     - Token de acesso decriptografado (usar imediatamente)
 * @param toPhoneNumber   - Número do destinatário (será limpo de máscaras)
 * @param text            - Texto da mensagem
 * @param professionalId  - Para detecção de token_invalid (opcional)
 */
export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  toPhoneNumber: string,
  text: string,
  professionalId?: string,
): Promise<void> {
  await graphRequest(
    `/${phoneNumberId}/messages`,
    {
      method: 'POST',
      token: accessToken,
      body: {
        messaging_product: 'whatsapp',
        to: toPhoneNumber.replace(/\D/g, ''),
        type: 'text',
        text: { body: text },
      },
    },
    professionalId,
  )
}
