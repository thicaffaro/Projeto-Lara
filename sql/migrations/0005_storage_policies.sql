-- =============================================================================
-- 0005_storage_policies.sql
-- Lara — Políticas RLS para buckets de Storage do Supabase
--
-- Pré-requisito: buckets criados via storage-setup.ts ou Supabase Dashboard.
-- Executar como superuser / service_role via psql ou SQL Editor.
--
-- Buckets:
--   client-media  → privado; profissional acessa apenas seus arquivos
--   audit-archive → privado; apenas service_role (backend/n8n)
-- =============================================================================

-- =============================================================================
-- client-media
-- Path obrigatório: {professional_id}/{contact_id}/{timestamp}_{filename}
-- (storage.foldername(name))[1] extrai o primeiro segmento = professional_id
-- =============================================================================

-- Remover políticas antigas se já existirem (idempotência)
DROP POLICY IF EXISTS "client_media_select"  ON storage.objects;
DROP POLICY IF EXISTS "client_media_insert"  ON storage.objects;
DROP POLICY IF EXISTS "client_media_update"  ON storage.objects;
DROP POLICY IF EXISTS "client_media_delete"  ON storage.objects;
DROP POLICY IF EXISTS "audit_archive_deny_all" ON storage.objects;

-- SELECT: profissional lê apenas arquivos prefixados com seu professional_id
CREATE POLICY "client_media_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT
      FROM public.professionals
      WHERE auth_user_id = auth.uid()
    )
  );

-- INSERT: profissional faz upload apenas para seu próprio folder
CREATE POLICY "client_media_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT
      FROM public.professionals
      WHERE auth_user_id = auth.uid()
    )
  );

-- UPDATE: profissional atualiza metadados apenas dos seus arquivos
CREATE POLICY "client_media_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT
      FROM public.professionals
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT
      FROM public.professionals
      WHERE auth_user_id = auth.uid()
    )
  );

-- DELETE: profissional deleta apenas seus próprios arquivos
CREATE POLICY "client_media_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT
      FROM public.professionals
      WHERE auth_user_id = auth.uid()
    )
  );

-- =============================================================================
-- audit-archive
-- Sem políticas para roles públicas/autenticadas = apenas service_role acessa.
-- Adicionar política explícita de negação para authenticated como defesa extra.
-- =============================================================================

CREATE POLICY "audit_archive_deny_all"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id <> 'audit-archive')
  WITH CHECK (bucket_id <> 'audit-archive');

-- =============================================================================
-- Verificação (executar manualmente para confirmar)
-- =============================================================================
-- SELECT polname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'objects'
--   AND schemaname = 'storage';
