/**
 * /lib/ai/llm.ts
 * Wrapper unificado para chamadas LLM.
 *
 * Estratégia:
 *   1. Tenta Grok (xAI) — timeout configurável (padrão 3000ms)
 *   2. Se timeout/erro → fallback para Claude (Anthropic)
 *   3. Se ambos falham → { text: '', provider: 'fallback' }
 *
 * Rate limit e retry ficam no n8n — este módulo é stateless.
 *
 * SEGURANÇA: XAI_API_KEY e ANTHROPIC_API_KEY nunca aparecem em logs.
 */

import Anthropic from '@anthropic-ai/sdk'

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  text: string
  provider: 'grok' | 'claude' | 'fallback'
  latency_ms: number
}

export interface LLMOptions {
  maxTokens?: number
  temperature?: number
  /** Timeout em ms para o Grok. Padrão: 3000ms */
  timeoutMs?: number
}

// ── Grok (xAI — API compatível com OpenAI) ────────────────────────────────────

interface GrokChoice {
  message: { content: string }
}
interface GrokResponse {
  choices: GrokChoice[]
}

async function callGrok(
  messages: LLMMessage[],
  options: LLMOptions,
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('[llm] XAI_API_KEY não configurada')

  const model      = process.env.XAI_MODEL ?? 'grok-3-mini'
  const timeoutMs  = options.timeoutMs ?? 3_000
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens:  options.maxTokens  ?? 500,
        temperature: options.temperature ?? 0.7,
      }),
    })

    if (!res.ok) {
      // Não logar o body — pode conter informação sensível
      throw new Error(`Grok API ${res.status}`)
    }

    const data = await res.json() as GrokResponse
    const text = data.choices?.[0]?.message?.content ?? ''
    if (!text) throw new Error('Grok retornou resposta vazia')
    return text

  } finally {
    clearTimeout(timer)
  }
}

// ── Claude (Anthropic) ────────────────────────────────────────────────────────

async function callClaude(
  messages: LLMMessage[],
  options: LLMOptions,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[llm] ANTHROPIC_API_KEY não configurada')

  const model = process.env.ANTHROPIC_FALLBACK_MODEL ?? 'claude-haiku-4-5-20251001'

  // Claude exige system como parâmetro separado e messages sem role 'system'
  const systemMsg = messages.find(m => m.role === 'system')?.content
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const client = new Anthropic({ apiKey })

  // Promise.race implementa timeout via abort-signal-not-supported-fallback
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Claude timeout')), options.timeoutMs ?? 8_000)
  )

  const apiCall = client.messages.create({
    model,
    max_tokens:  options.maxTokens  ?? 500,
    temperature: options.temperature ?? 0.7,
    ...(systemMsg ? { system: systemMsg } : {}),
    messages: chatMessages,
  })

  const message = await Promise.race([apiCall, timeout])

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Claude retornou bloco não-texto')
  return block.text
}

// ── callLLM — função principal ────────────────────────────────────────────────

/**
 * Chama o LLM disponível (Grok → Claude → fallback vazio).
 * Nunca lança exceção — retorna provider: 'fallback' em último caso.
 */
export async function callLLM(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMResponse> {
  const start = Date.now()

  // ── Tentativa 1: Grok ─────────────────────────────────────────────────────
  try {
    const text = await callGrok(messages, options)
    return { text, provider: 'grok', latency_ms: Date.now() - start }
  } catch (err) {
    // Log sanitizado — sem API key, sem payload completo
    console.warn('[llm] grok failed, trying claude —', err instanceof Error ? err.message : 'unknown')
  }

  // ── Tentativa 2: Claude ───────────────────────────────────────────────────
  try {
    const text = await callClaude(messages, options)
    return { text, provider: 'claude', latency_ms: Date.now() - start }
  } catch (err) {
    console.warn('[llm] claude failed, using fallback —', err instanceof Error ? err.message : 'unknown')
  }

  // ── Fallback: texto vazio ─────────────────────────────────────────────────
  return { text: '', provider: 'fallback', latency_ms: Date.now() - start }
}
