/**
 * /lib/media/transcribe.ts
 * Transcrição de áudio para texto via Whisper.
 *
 * PROVIDERS (em ordem de preferência):
 *   1. xAI (api.x.ai/v1/audio/transcriptions) — principal
 *   2. OpenAI (api.openai.com/v1/audio/transcriptions) — fallback
 *   3. failed — se ambos falharem
 *
 * Variáveis de ambiente:
 *   XAI_API_KEY       — obrigatória para xAI
 *   XAI_BASE_URL      — default: https://api.x.ai/v1
 *   OPENAI_API_KEY    — opcional, apenas para fallback de transcrição
 *
 * Formato de áudio aceito pelo Whisper: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg
 * OGG/Opus do WhatsApp é aceito diretamente como 'audio/ogg'.
 */

const TRANSCRIPTION_TIMEOUT_MS = 15_000

export interface TranscriptionResult {
  text:       string
  provider:   'xai' | 'openai' | 'failed'
  latency_ms: number
}

// ── MIME → nome de arquivo para o FormData ───────────────────────────────────

function mimeToFilename(mimeType: string): string {
  const normalized = mimeType.split(';')[0].trim()
  const map: Record<string, string> = {
    'audio/ogg':   'audio.ogg',
    'audio/mpeg':  'audio.mp3',
    'audio/mp3':   'audio.mp3',
    'audio/mp4':   'audio.mp4',
    'audio/aac':   'audio.aac',
    'audio/wav':   'audio.wav',
    'audio/webm':  'audio.webm',
  }
  return map[normalized] ?? 'audio.ogg'
}

// ── Chamada genérica ao endpoint Whisper ─────────────────────────────────────

async function callWhisper(
  endpoint: string,
  apiKey:   string,
  buffer:   Buffer,
  mimeType: string,
): Promise<string> {
  const filename = mimeToFilename(mimeType)
  const blob     = new Blob([buffer], { type: mimeType.split(';')[0].trim() })
  const form     = new FormData()

  form.append('file',     blob, filename)
  form.append('model',    'whisper-large-v3')
  form.append('language', 'pt')
  form.append('response_format', 'text')

  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TRANSCRIPTION_TIMEOUT_MS)

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body:    form,
      signal:  ctrl.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    }

    const text = await res.text()
    return text.trim()
  } finally {
    clearTimeout(timer)
  }
}

// ── Transcrição com fallback ──────────────────────────────────────────────────

/**
 * Transcreve áudio para texto.
 * Tenta xAI Whisper primeiro; fallback para OpenAI.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType:    string,
): Promise<TranscriptionResult> {
  const start = Date.now()

  // ── Provider 1: xAI ────────────────────────────────────────────────────────
  const xaiKey     = process.env.XAI_API_KEY
  const xaiBaseUrl = (process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1').replace(/\/$/, '')

  if (xaiKey) {
    try {
      const text = await callWhisper(
        `${xaiBaseUrl}/audio/transcriptions`,
        xaiKey,
        audioBuffer,
        mimeType,
      )
      return { text, provider: 'xai', latency_ms: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      console.warn('[media/transcribe] xAI falhou, tentando OpenAI:', msg)
    }
  } else {
    console.warn('[media/transcribe] XAI_API_KEY não configurado — pulando xAI')
  }

  // ── Provider 2: OpenAI ─────────────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY

  if (openaiKey) {
    try {
      const text = await callWhisper(
        'https://api.openai.com/v1/audio/transcriptions',
        openaiKey,
        audioBuffer,
        mimeType,
      )
      return { text, provider: 'openai', latency_ms: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      console.error('[media/transcribe] OpenAI também falhou:', msg)
    }
  } else {
    console.warn('[media/transcribe] OPENAI_API_KEY não configurado — sem fallback de transcrição')
  }

  // ── Falha total ────────────────────────────────────────────────────────────
  return { text: '', provider: 'failed', latency_ms: Date.now() - start }
}
