/**
 * /lib/ai/intentClassifier.ts
 * Classifica a intenção de uma mensagem recebida.
 *
 * Estratégia em camadas:
 *   1. LLM (Grok → Claude) com prompt estático, maxTokens=10, temperature=0
 *   2. Keyword regex como fallback determinístico se LLM falhar ou retornar inválido
 *
 * Nunca lança exceção — garante sempre uma resposta.
 */

import { callLLM } from './llm'
import { buildSystemPromptIntentClassification } from './prompts'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type Intent = 'AGENDAR' | 'CANCELAR' | 'REMARCAR' | 'INFORMACAO' | 'SUPORTE' | 'OUTRO'

export interface IntentResult {
  intent: Intent
  provider: 'grok' | 'claude' | 'keyword_fallback'
}

// ── Intents válidos ───────────────────────────────────────────────────────────

const VALID_INTENTS = new Set<Intent>([
  'AGENDAR', 'CANCELAR', 'REMARCAR', 'INFORMACAO', 'SUPORTE', 'OUTRO',
])

// ── Fallback por keywords (ordem importa: OUTRO deve ser último) ──────────────

const KEYWORD_FALLBACK_ORDER: Intent[] = [
  'AGENDAR', 'CANCELAR', 'REMARCAR', 'SUPORTE', 'INFORMACAO', 'OUTRO',
]

const KEYWORD_FALLBACK: Record<Intent, RegExp> = {
  AGENDAR:   /agendar|marcar|tem horário|tem sessão|disponível|vaga|quero (uma|agendar)|encaixe/i,
  CANCELAR:  /cancelar|desmarcar|não (vou|posso) (mais|ir)|cancela/i,
  REMARCAR:  /remarcar|remarcar|mudar (o horário|a sessão|o dia)|trocar|transferir/i,
  SUPORTE:   /ajuda|suporte|humano|atendente|falar com|preciso de ajuda/i,
  INFORMACAO:/preço|valor|quanto custa|protocolo|serviço|duração|como funciona|informação/i,
  OUTRO:     /.*/,
}

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Classifica a intenção de uma mensagem.
 * Nunca lança exceção.
 *
 * @param messageText Texto da mensagem recebida
 */
export async function classifyIntent(messageText: string): Promise<IntentResult> {
  // ── Tentativa via LLM ────────────────────────────────────────────────────
  try {
    const response = await callLLM(
      [
        { role: 'system',  content: buildSystemPromptIntentClassification() },
        { role: 'user',    content: messageText },
      ],
      {
        maxTokens:   10,
        temperature: 0,    // determinístico
        timeoutMs:   3_000,
      },
    )

    if (response.provider !== 'fallback') {
      // Normaliza: remove tudo exceto letras maiúsculas
      const raw = response.text.trim().toUpperCase().replace(/[^A-Z]/g, '') as Intent

      if (VALID_INTENTS.has(raw)) {
        return { intent: raw, provider: response.provider as 'grok' | 'claude' }
      }

      console.warn('[intentClassifier] LLM retornou intent inválido:', JSON.stringify(response.text))
    }
  } catch (err) {
    console.warn('[intentClassifier] LLM falhou, usando keyword fallback —',
      err instanceof Error ? err.message : 'unknown')
  }

  // ── Fallback por keywords ────────────────────────────────────────────────
  for (const intent of KEYWORD_FALLBACK_ORDER) {
    if (KEYWORD_FALLBACK[intent].test(messageText)) {
      return { intent, provider: 'keyword_fallback' }
    }
  }

  // Nunca deve chegar aqui (OUTRO captura tudo via /.*/)
  return { intent: 'OUTRO', provider: 'keyword_fallback' }
}
