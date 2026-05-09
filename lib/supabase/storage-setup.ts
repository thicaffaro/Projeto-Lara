/**
 * /lib/supabase/storage-setup.ts
 *
 * Configuração dos buckets de Storage do Supabase.
 * Executado via script de setup ou durante o boot da aplicação (uma vez).
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY (não anon key).
 *
 * Buckets:
 * - client-media  : fotos, áudios, vídeos e documentos recebidos de clientes via WhatsApp
 * - audit-archive : partições antigas de audit_log exportadas para storage frio
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Cria os buckets de storage necessários para o Lara.
 * Idempotente — seguro chamar múltiplas vezes.
 */
export async function setupStorageBuckets(): Promise<void> {
  await ensureClientMediaBucket()
  await ensureAuditArchiveBucket()
  console.log('[storage-setup] Buckets configurados com sucesso.')
}

// ── client-media ──────────────────────────────────────────────────────────────

async function ensureClientMediaBucket(): Promise<void> {
  const BUCKET_NAME = 'client-media'

  const { data: existing } = await supabaseAdmin.storage.getBucket(BUCKET_NAME)

  if (!existing) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
      public: false,                // Privado — URLs geradas sob demanda com signed URLs
      fileSizeLimit: 16 * 1024 * 1024, // 16 MB (limite da Meta para mídia)
      allowedMimeTypes: [
        // Imagens
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        // Áudios
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/aac',
        'audio/amr',
        // Vídeos
        'video/mp4',
        'video/3gpp',
        // Documentos
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    })

    if (error) {
      throw new Error(`[storage-setup] Falha ao criar bucket ${BUCKET_NAME}: ${error.message}`)
    }

    console.log(`[storage-setup] Bucket "${BUCKET_NAME}" criado.`)
  }

  await applyClientMediaRLS(BUCKET_NAME)
}

/**
 * Política RLS do bucket client-media:
 * - Profissional acessa apenas arquivos com path prefixado com seu professional_id
 * - Path obrigatório: {professional_id}/{contact_id}/{timestamp}_{filename}
 */
async function applyClientMediaRLS(bucketName: string): Promise<void> {
  // SELECT: profissional lê apenas seus arquivos
  await supabaseAdmin.storage.from(bucketName)
  // Políticas de storage são aplicadas via SQL no Supabase Dashboard ou via migration SQL.
  // O Supabase JS SDK não expõe API para criar políticas programaticamente.
  // As políticas abaixo devem ser executadas via SQL (ver comentário abaixo).

  /*
   * SQL para aplicar via Supabase Dashboard > SQL Editor:
   *
   * -- Leitura: profissional acessa apenas arquivos do seu professional_id
   * CREATE POLICY "client_media_select"
   * ON storage.objects FOR SELECT
   * USING (
   *   bucket_id = 'client-media'
   *   AND (storage.foldername(name))[1] IN (
   *     SELECT id::text FROM professionals WHERE auth_user_id = auth.uid()
   *   )
   * );
   *
   * -- Upload: profissional faz upload apenas para seu próprio folder
   * CREATE POLICY "client_media_insert"
   * ON storage.objects FOR INSERT
   * WITH CHECK (
   *   bucket_id = 'client-media'
   *   AND (storage.foldername(name))[1] IN (
   *     SELECT id::text FROM professionals WHERE auth_user_id = auth.uid()
   *   )
   * );
   *
   * -- Delete: profissional deleta apenas seus próprios arquivos
   * CREATE POLICY "client_media_delete"
   * ON storage.objects FOR DELETE
   * USING (
   *   bucket_id = 'client-media'
   *   AND (storage.foldername(name))[1] IN (
   *     SELECT id::text FROM professionals WHERE auth_user_id = auth.uid()
   *   )
   * );
   *
   * -- Service role (backend/n8n) tem acesso total — via SUPABASE_SERVICE_ROLE_KEY
   */
}

// ── audit-archive ─────────────────────────────────────────────────────────────

async function ensureAuditArchiveBucket(): Promise<void> {
  const BUCKET_NAME = 'audit-archive'

  const { data: existing } = await supabaseAdmin.storage.getBucket(BUCKET_NAME)

  if (!existing) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
      public: false,                        // Privado — apenas service role acessa
      fileSizeLimit: 500 * 1024 * 1024,     // 500 MB por arquivo (partições exportadas)
      allowedMimeTypes: [
        'application/gzip',
        'application/x-gzip',
        'application/json',
        'text/plain',
      ],
    })

    if (error) {
      throw new Error(`[storage-setup] Falha ao criar bucket ${BUCKET_NAME}: ${error.message}`)
    }

    console.log(`[storage-setup] Bucket "${BUCKET_NAME}" criado.`)
  }

  /*
   * audit-archive: acesso restrito apenas à service role key (backend/n8n).
   * Nenhuma política RLS de usuário final é necessária.
   *
   * SQL para bloquear acesso anon/authenticated (apenas service role passa):
   *
   * -- Sem políticas públicas = apenas service role acessa
   * -- Para confirmar, NÃO criar políticas USING (TRUE) neste bucket.
   */
}

// ── Ciclo de vida / retenção ──────────────────────────────────────────────────

/**
 * Convenções de path e retenção para client-media:
 *
 * Path: {professional_id}/{contact_id}/{unix_timestamp}_{original_filename}
 * Exemplo: "uuid-prof/uuid-contact/1704067200_foto_antes.jpg"
 *
 * Retenção:
 * - Arquivos com >12 meses são movidos para audit-archive pelo job n8n
 * - Job n8n: cron diário, lista objetos com created_at < NOW() - 12 months
 *   e move para audit-archive/{professional_id}/{year}/{month}/
 *
 * Signed URLs:
 * - Geradas com expiração de 1 hora para visualização no dashboard
 * - Ver /lib/media/download.ts para implementação
 */
export const STORAGE_CONFIG = {
  clientMedia: {
    bucket: 'client-media',
    maxFileSizeBytes: 16 * 1024 * 1024,
    retentionMonths: 12,
    signedUrlExpirySeconds: 3600, // 1 hora
    pathPattern: '{professionalId}/{contactId}/{timestamp}_{filename}',
  },
  auditArchive: {
    bucket: 'audit-archive',
    maxFileSizeBytes: 500 * 1024 * 1024,
    retentionMonths: 72, // 6 anos (requisito fiscal)
    signedUrlExpirySeconds: 300, // 5 minutos
  },
} as const
