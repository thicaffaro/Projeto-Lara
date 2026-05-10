/**
 * /lib/sms/twilio.ts
 * Wrapper Twilio para envio de SMS de recuperação.
 *
 * Política:
 * - Números devem ter prefixo +55 (Brasil)
 * - Timeout 10s por tentativa
 * - Retry automático: 3 tentativas, backoff 1s → 3s → 7s
 * - Logging sanitizado: apenas os primeiros 30 chars do body (evita vazar tokens)
 */

import twilio from 'twilio'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SmsOptions {
  to: string   // número destino (aceita com ou sem +55)
  body: string // corpo da mensagem
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BACKOFF_MS = [1_000, 3_000, 7_000] as const // 1s, 3s, 7s

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Normaliza número para E.164 com prefixo +55.
 * Aceita: "11999998888", "5511999998888", "+5511999998888"
 */
function normalizeToBrazilianE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`
  }
  // Número já em formato +55... ou outro país — retorna com +
  return phone.startsWith('+') ? phone : `+${digits}`
}

/**
 * Valida que o número é brasileiro (+55).
 * Lança erro se inválido.
 */
function assertBrazilianNumber(phone: string): void {
  if (!phone.startsWith('+55')) {
    throw new Error(`[twilio] Número inválido: deve começar com +55. Recebido: ${phone.slice(0, 4)}***`)
  }
}

/**
 * Retorna os primeiros N caracteres do body para logging seguro.
 * Tokens e informações sensíveis ficam fora dos logs.
 */
function sanitizeForLog(body: string, maxChars = 30): string {
  return body.slice(0, maxChars) + (body.length > maxChars ? '…' : '')
}

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Envia SMS via Twilio com retry automático.
 * @throws Error após 3 tentativas fracassadas
 */
export async function sendSms(options: SmsOptions): Promise<void> {
  const accountSid   = process.env.TWILIO_ACCOUNT_SID
  const authToken    = process.env.TWILIO_AUTH_TOKEN
  const fromNumber   = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('[twilio] TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_PHONE_NUMBER são obrigatórios')
  }

  const to   = normalizeToBrazilianE164(options.to)
  assertBrazilianNumber(to)

  const client  = twilio(accountSid, authToken)
  const bodyLog = sanitizeForLog(options.body)
  let lastError: Error | null = null

  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    try {
      // Promise.race implementa timeout de 10s
      await Promise.race([
        client.messages.create({
          from: fromNumber,
          to,
          body: options.body,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout 10s')), 10_000)
        ),
      ])

      // Sucesso
      return

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isLastAttempt = attempt === BACKOFF_MS.length - 1

      console.error(
        `[twilio] Falha no envio (tentativa ${attempt + 1}/${BACKOFF_MS.length}):`,
        lastError.message,
        `| body: "${bodyLog}"`,
      )

      if (!isLastAttempt) {
        await sleep(BACKOFF_MS[attempt])
      }
    }
  }

  throw new Error(`[twilio] Falha após ${BACKOFF_MS.length} tentativas. Último erro: ${lastError?.message}`)
}
