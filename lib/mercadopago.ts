/**
 * /lib/mercadopago.ts
 * Wrapper para a API do Mercado Pago.
 *
 * Funções de cobrança:
 *   pausePreapproval  — pausa assinatura (token_invalid > 7 dias)
 *   resumePreapproval — retoma assinatura (após reconexão Meta)
 *
 * SEGURANÇA: MP_ACCESS_TOKEN NUNCA aparece em logs.
 * Retry: 3 tentativas, backoff 2s → 4s → 8s, timeout 10s por tentativa.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MpApiError extends Error {
  statusCode?: number
  mpError?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MP_BASE   = 'https://api.mercadopago.com'
const BACKOFF_MS = [2_000, 4_000, 8_000] as const

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function getMpToken(): string {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw new Error('[mercadopago] MP_ACCESS_TOKEN não configurado')
  return token
}

/**
 * Faz uma requisição à API do Mercado Pago com retry e timeout.
 * MP_ACCESS_TOKEN nunca aparece em logs — apenas o statusCode.
 */
async function mpRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const token  = getMpToken()
  let lastError: Error | null = null

  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    try {
      const result = await Promise.race([
        fetch(`${MP_BASE}${path}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout 10s')), 10_000)
        ),
      ])

      if (!result.ok) {
        const resBody = await result.json().catch(() => ({})) as Record<string, unknown>
        // Log sem o token — apenas status e mensagem de erro da API
        const mpMsg = (resBody.message as string) ?? (resBody.error as string) ?? 'erro desconhecido'
        const err = new Error(`MP API ${result.status}: ${mpMsg}`) as MpApiError
        err.statusCode = result.status
        err.mpError    = mpMsg
        throw err
      }

      return // sucesso

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isLast = attempt === BACKOFF_MS.length - 1

      // Log sanitizado — sem token, sem dados sensíveis
      console.error(
        `[mercadopago] Falha na requisição (tentativa ${attempt + 1}/${BACKOFF_MS.length}):`,
        lastError.message,
        `| path: ${path}`,
      )

      if (!isLast) await sleep(BACKOFF_MS[attempt])
    }
  }

  throw new Error(`[mercadopago] Falha após ${BACKOFF_MS.length} tentativas: ${lastError?.message}`)
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Pausa uma assinatura recorrente no Mercado Pago.
 * Chamado quando whatsapp_status='token_invalid' por > 7 dias.
 * @param mpSubscriptionId — ID da assinatura em subscriptions.mp_subscription_id
 */
export async function pausePreapproval(mpSubscriptionId: string): Promise<void> {
  if (!mpSubscriptionId) throw new Error('[mercadopago] mpSubscriptionId obrigatório')
  await mpRequest(`/preapproval/${mpSubscriptionId}`, { status: 'paused' })
}

/**
 * Retoma uma assinatura pausada no Mercado Pago.
 * Chamado quando profissional reconecta após token_invalid.
 * @param mpSubscriptionId — ID da assinatura em subscriptions.mp_subscription_id
 */
export async function resumePreapproval(mpSubscriptionId: string): Promise<void> {
  if (!mpSubscriptionId) throw new Error('[mercadopago] mpSubscriptionId obrigatório')
  // 'authorized' é o status de assinatura ativa no MP
  await mpRequest(`/preapproval/${mpSubscriptionId}`, { status: 'authorized' })
}
