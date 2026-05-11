/**
 * /lib/media/upload.ts
 * Upload de mídia para Supabase Storage (bucket client-media).
 *
 * ESTRUTURA DE PATHS:
 *   {professional_id}/{contact_id}/{YYYY-MM}/{timestamp}_{random6}.{ext}
 *
 * LIMITES DE TAMANHO (rejeitar antes do upload):
 *   Imagem:    16 MB (limite Meta)
 *   Áudio:     16 MB
 *   Vídeo:     16 MB
 *   Documento: 100 MB
 *   Outros:    16 MB (padrão conservador)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'

export interface MediaUploadResult {
  publicUrl:   string
  storagePath: string
  sizeBytes:   number
}

// ── MIME → extensão ──────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/jpg':       'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/gif':       'gif',
  'image/heic':      'heic',
  'audio/ogg':       'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg':      'mp3',
  'audio/mp3':       'mp3',
  'audio/mp4':       'mp4',
  'audio/aac':       'aac',
  'audio/wav':       'wav',
  'audio/webm':      'webm',
  'video/mp4':       'mp4',
  'video/3gpp':      '3gp',
  'video/webm':      'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

const SIZE_LIMIT_MB: Record<string, number> = {
  image:    16,
  audio:    16,
  video:    16,
  document: 100,
  sticker:  1,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mimeToExt(mimeType: string): string {
  // Normaliza: remove parâmetros (ex: "audio/ogg; codecs=opus" → busca completo primeiro)
  return MIME_TO_EXT[mimeType]
    ?? MIME_TO_EXT[mimeType.split(';')[0].trim()]
    ?? 'bin'
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

function getMediaCategory(mimeType: string): keyof typeof SIZE_LIMIT_MB {
  const m = mimeType.split('/')[0]
  if (m === 'image') return 'image'
  if (m === 'audio') return 'audio'
  if (m === 'video') return 'video'
  return 'document'
}

function buildStoragePath(
  professionalId: string,
  contactId:      string,
  mimeType:       string,
): string {
  const now    = new Date()
  const month  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const ext    = mimeToExt(mimeType)
  const unique = `${Date.now()}_${randomHex(3)}.${ext}`
  return `${professionalId}/${contactId}/${month}/${unique}`
}

// ── Upload ───────────────────────────────────────────────────────────────────

/**
 * Faz upload de mídia para Supabase Storage.
 * Retorna null se o upload falhar ou o tamanho exceder o limite.
 */
export async function uploadMediaToStorage(
  buffer:         Buffer,
  mimeType:       string,
  professionalId: string,
  contactId:      string,
): Promise<MediaUploadResult | null> {
  // Verificar limite de tamanho
  const category  = getMediaCategory(mimeType)
  const limitBytes = (SIZE_LIMIT_MB[category] ?? 16) * 1024 * 1024

  if (buffer.length > limitBytes) {
    console.warn(
      `[media/upload] Arquivo muito grande: ${buffer.length} bytes > ${limitBytes} bytes (${category})`,
      professionalId,
    )
    return null
  }

  if (buffer.length === 0) {
    console.error('[media/upload] Buffer vazio recebido', professionalId)
    return null
  }

  const storagePath = buildStoragePath(professionalId, contactId, mimeType)
  const supabase    = createAdminClient()

  const { error: uploadError } = await supabase.storage
    .from('client-media')
    .upload(storagePath, buffer, {
      contentType: mimeType.split(';')[0].trim(),
      upsert:      false,
    })

  if (uploadError) {
    console.error('[media/upload] Upload falhou:', uploadError.message, storagePath)
    return null
  }

  const { data: urlData } = supabase.storage
    .from('client-media')
    .getPublicUrl(storagePath)

  const publicUrl = urlData.publicUrl

  return {
    publicUrl,
    storagePath,
    sizeBytes: buffer.length,
  }
}
