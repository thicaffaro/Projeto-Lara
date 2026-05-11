/**
 * /lib/media/processMedia.ts
 * Pipeline orquestrador de processamento de mídia recebida via WhatsApp.
 *
 * PIPELINE:
 *   1. Download do CDN Meta (urgente — URL expira em ~5min)
 *   2. Upload para Supabase Storage (bucket client-media)
 *   3. Se áudio: transcreve via Whisper (xAI → OpenAI fallback)
 *   4. Retorna metadados para salvar em messages
 *
 * FALHAS:
 *   - Download falhou → retorna null. A mensagem é salva sem media_url.
 *     O chat exibe "Mídia não disponível".
 *   - Upload falhou → retorna null. Mesmo comportamento.
 *   - Transcrição falhou → retorna ProcessedMedia sem transcription.
 *     A Lara não consegue classificar o intent do áudio.
 */

import { downloadMediaFromMeta } from './download'
import { uploadMediaToStorage }  from './upload'
import { transcribeAudio }       from './transcribe'

export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker'

export interface ProcessedMedia {
  storageUrl:             string
  storagePath:            string
  mediaType:              MediaType
  mimeType:               string
  sizeBytes:              number
  caption?:               string
  transcription?:         string
  transcriptionProvider?: string
}

export interface ProcessMediaParams {
  mediaId:        string
  mediaType:      MediaType
  mimeType:       string
  caption?:       string
  accessToken:    string
  professionalId: string
  contactId:      string
}

/**
 * Pipeline completo de processamento de mídia.
 * Retorna null se download ou upload falharem.
 */
export async function processMedia(
  params: ProcessMediaParams,
): Promise<ProcessedMedia | null> {
  const { mediaId, mediaType, mimeType, caption, accessToken, professionalId, contactId } = params

  // ── 1. Download ────────────────────────────────────────────────────────────
  const downloaded = await downloadMediaFromMeta(mediaId, accessToken)

  if (!downloaded) {
    console.error('[media/process] Download falhou — mídia não disponível:', mediaId, professionalId)
    return null
  }

  // ── 2. Upload ──────────────────────────────────────────────────────────────
  const uploaded = await uploadMediaToStorage(
    downloaded.buffer,
    downloaded.mimeType || mimeType,
    professionalId,
    contactId,
  )

  if (!uploaded) {
    console.error('[media/process] Upload falhou:', mediaId, professionalId)
    return null
  }

  const result: ProcessedMedia = {
    storageUrl:  uploaded.publicUrl,
    storagePath: uploaded.storagePath,
    mediaType,
    mimeType:    downloaded.mimeType || mimeType,
    sizeBytes:   uploaded.sizeBytes,
    caption,
  }

  // ── 3. Transcrição (apenas áudio) ──────────────────────────────────────────
  if (mediaType === 'audio') {
    const transcription = await transcribeAudio(downloaded.buffer, downloaded.mimeType || mimeType)

    if (transcription.provider !== 'failed' && transcription.text) {
      result.transcription         = transcription.text
      result.transcriptionProvider = transcription.provider
    }
    // Se transcrição falhou: result.transcription fica undefined
    // A Lara não responde ao áudio mas a mensagem é salva com a URL
  }

  return result
}
