/**
 * /lib/email/resend.ts
 * Wrapper Resend para envio de email transacional.
 *
 * Política:
 * - Timeout 15s por tentativa
 * - Retry automático: 3 tentativas, backoff 2s → 5s → 10s
 * - Template HTML simples com inline styles (compatível com todos clientes de email)
 * - Plain text fallback automático (gerado a partir do html se não fornecido)
 *
 * Variáveis de ambiente:
 *   RESEND_API_KEY    — chave da API Resend
 *   RESEND_FROM_EMAIL — remetente (ex: noreply@laraassistente.com.br)
 */

import { Resend } from 'resend'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface EmailOptions {
  to: string
  subject: string
  /** HTML do corpo. Se não fornecido, usa 'text'. */
  html?: string
  /** Plain text fallback. Gerado a partir do html se omitido. */
  text?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BACKOFF_MS = [2_000, 5_000, 10_000] as const

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Converte HTML simples em plain text removendo tags */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Template HTML ─────────────────────────────────────────────────────────────

/**
 * Envolve o conteúdo em template HTML padrão da Lara.
 * CSS inline para compatibilidade máxima com clientes de email.
 * Sem media queries — layout simples e responsivo naturalmente.
 */
export function buildEmailHtml(content: string): string {
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://laraassistente.com.br'
  const privacyUrl  = `${appUrl}/docs/privacy`
  const supportUrl  = 'https://wa.me/5511978663056'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lara Assistente</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background-color:#f43f5e;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.025em;">
                Lara Assistente
              </p>
              <p style="margin:4px 0 0;font-size:13px;color:#fecdd3;">
                Agenda automática para esteticistas
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
                Você recebeu este email porque realizou uma solicitação na Lara Assistente.<br>
                <a href="${privacyUrl}" style="color:#f43f5e;text-decoration:none;">Política de Privacidade</a>
                &nbsp;·&nbsp;
                <a href="${supportUrl}" style="color:#f43f5e;text-decoration:none;">Falar com Suporte</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Função principal ──────────────────────────────────────────────────────────

let _resendClient: Resend | null = null

function getResendClient(): Resend {
  if (!_resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('[resend] RESEND_API_KEY não configurada')
    _resendClient = new Resend(apiKey)
  }
  return _resendClient
}

/**
 * Envia email via Resend com retry automático.
 * Se 'html' não for fornecido, usa 'text' como conteúdo.
 * Se 'text' não for fornecido, gera plain text a partir do html.
 * @throws Error após 3 tentativas fracassadas
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!fromEmail) throw new Error('[resend] RESEND_FROM_EMAIL não configurado')

  // Plain text fallback automático
  const text = options.text ?? (options.html ? htmlToPlainText(options.html) : '')
  const html = options.html ?? `<p style="font-size:15px;line-height:1.6;color:#374151;">${text.replace(/\n/g, '<br>')}</p>`

  const resend    = getResendClient()
  let lastError: Error | null = null

  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    try {
      const result = await Promise.race([
        resend.emails.send({
          from: fromEmail,
          to:   options.to,
          subject: options.subject,
          html,
          text,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout 15s')), 15_000)
        ),
      ])

      if (result.error) {
        throw new Error(`Resend API error: ${result.error.message}`)
      }

      return // Sucesso

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isLastAttempt = attempt === BACKOFF_MS.length - 1

      console.error(
        `[resend] Falha no envio (tentativa ${attempt + 1}/${BACKOFF_MS.length}):`,
        lastError.message,
        `| to: ${options.to.slice(0, 3)}***`,
      )

      if (!isLastAttempt) {
        await sleep(BACKOFF_MS[attempt])
      }
    }
  }

  throw new Error(`[resend] Falha após ${BACKOFF_MS.length} tentativas. Último erro: ${lastError?.message}`)
}
