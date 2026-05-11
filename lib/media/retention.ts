/**
 * /lib/media/retention.ts
 * Limpeza de mídias expiradas do Supabase Storage.
 *
 * POLÍTICA:
 *   - Padrão: 90 dias de retenção para todas as mídias
 *   - Chamado diariamente pelo cron do n8n (04:00)
 *   - Após deletar do Storage: atualiza messages.media_url = 'deleted'
 *
 * LGPD:
 *   - A deleção do Storage remove o binário mas mantém o registro em messages
 *   - Isso preserva o histórico sem armazenar dados desnecessários
 *   - Para exclusão LGPD completa, usar DELETE em messages diretamente
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface RetentionResult {
  deleted: number
  errors:  number
}

type MessageWithMedia = {
  id:        string
  media_url: string
}

/**
 * Extrai o storage path a partir da URL pública do Supabase Storage.
 * URL format: https://{project}.supabase.co/storage/v1/object/public/client-media/{path}
 */
function extractStoragePath(publicUrl: string): string | null {
  try {
    const marker = '/object/public/client-media/'
    const idx    = publicUrl.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(publicUrl.slice(idx + marker.length))
  } catch {
    return null
  }
}

/**
 * Remove mídias do Storage após o período de retenção.
 * Atualiza media_url = 'deleted' nas mensagens processadas.
 */
export async function cleanupExpiredMedia(
  retentionDays = 90,
): Promise<RetentionResult> {
  const supabase   = createAdminClient()
  const cutoffDate = new Date(Date.now() - retentionDays * 86_400_000).toISOString()

  let deleted = 0
  let errors  = 0

  // Busca mensagens com mídia mais antigas que o período de retenção
  // Exclui as que já foram processadas (media_url = 'deleted')
  const { data: messages, error: queryError } = await supabase
    .from('messages')
    .select('id, media_url')
    .not('media_url', 'is', null)
    .neq('media_url', 'deleted')
    .lt('created_at', cutoffDate)
    .limit(500) // processa em lotes de 500 por execução

  if (queryError) {
    console.error('[media/retention] Erro ao buscar mensagens:', queryError.message)
    return { deleted: 0, errors: 1 }
  }

  if (!messages || messages.length === 0) {
    console.log('[media/retention] Nenhuma mídia expirada encontrada')
    return { deleted: 0, errors: 0 }
  }

  console.log(`[media/retention] Processando ${messages.length} mensagens com mídia expirada`)

  for (const msg of messages as unknown as MessageWithMedia[]) {
    try {
      const storagePath = extractStoragePath(msg.media_url)

      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from('client-media')
          .remove([storagePath])

        if (storageError) {
          // Se o arquivo já não existe no storage, considera como sucesso
          if (!storageError.message.includes('Not Found') && !storageError.message.includes('404')) {
            console.warn('[media/retention] Erro ao deletar do storage:', storagePath, storageError.message)
            errors++
            continue
          }
        }
      } else {
        console.warn('[media/retention] Não foi possível extrair path da URL:', msg.media_url, msg.id)
      }

      // Marcar como deletado independente do resultado do storage
      // (pode ser que já estava ausente no storage)
      await supabase
        .from('messages')
        .update({ media_url: 'deleted', media_size_bytes: 0 })
        .eq('id', msg.id)

      deleted++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'erro desconhecido'
      console.error('[media/retention] Erro ao processar mensagem:', msg.id, errMsg)
      errors++
    }
  }

  console.log(`[media/retention] Concluído: ${deleted} deletadas, ${errors} erros`)
  return { deleted, errors }
}
