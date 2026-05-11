/**
 * /lib/media/download.ts
 * Download de mídia do CDN Meta.
 *
 * ⚠️ URLs do CDN Meta expiram em ~5 minutos após o webhook.
 *    Download deve ocorrer IMEDIATAMENTE após receber a mensagem.
 *
 * FLUXO:
 *   Passo 1: GET graph.facebook.com/{version}/{mediaId} → { id, url }
 *   Passo 2: GET {url} com Bearer token → binário da mídia
 *
 * Ambos os passos usam AbortController com timeout de 10s.
 * Em qualquer falha: loga o erro e retorna null (mensagem salva sem mídia).
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? 'v19.0'
const TIMEOUT_MS    = parseInt(process.env.META_MEDIA_DOWNLOAD_TIMEOUT_MS ?? '10000', 10)

export interface MediaDownloadResult {
  buffer:      Buffer
  mimeType:    string
  sizeBytes:   number
  originalUrl: string
}

/**
 * Baixa mídia do CDN Meta usando o access token da profissional.
 * Retorna null se o download falhar por qualquer motivo.
 */
export async function downloadMediaFromMeta(
  mediaId: string,
  accessToken: string,
): Promise<MediaDownloadResult | null> {
  // ── Passo 1: Resolver a URL real da mídia ────────────────────────────────
  let mediaUrl: string
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal:  ctrl.signal,
      },
    )
    clearTimeout(timer)

    if (!metaRes.ok) {
      console.error('[media/download] Resolver URL falhou:', mediaId, metaRes.status)
      return null
    }

    const meta = await metaRes.json() as { url?: string; id?: string }
    if (!meta.url) {
      console.error('[media/download] Resposta sem URL:', mediaId, JSON.stringify(meta).slice(0, 200))
      return null
    }

    mediaUrl = meta.url
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido'
    console.error('[media/download] Passo 1 falhou:', mediaId, msg)
    return null
  }

  // ── Passo 2: Baixar o binário da mídia ───────────────────────────────────
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

    const binRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  ctrl.signal,
    })
    clearTimeout(timer)

    if (!binRes.ok) {
      console.error('[media/download] Download binário falhou:', mediaId, binRes.status)
      return null
    }

    const arrayBuffer = await binRes.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)
    const mimeType    = binRes.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream'

    return {
      buffer,
      mimeType,
      sizeBytes:   buffer.length,
      originalUrl: mediaUrl,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido'
    console.error('[media/download] Passo 2 falhou:', mediaId, msg)
    return null
  }
}
