-- =============================================================================
-- 0002_seed_admin.sql
-- Lara — Seed do usuário administrador super_admin
-- ATENÇÃO: Substitua os valores de placeholder antes de executar em produção.
-- =============================================================================

DO $$
DECLARE
  v_admin_auth_user_id UUID;
  v_admin_email        TEXT := 'admin@laraassistente.com.br'; -- ALTERAR em produção
BEGIN

  -- Cria auth.user para o admin (Supabase Auth)
  -- Em produção, criar via Supabase Dashboard ou supabase.auth.admin.createUser()
  -- Este bloco é um placeholder para ambientes de desenvolvimento/CI

  -- Insere admin_user vinculado ao auth user
  -- Em produção, o auth_user_id virá do Supabase Auth após criação manual
  INSERT INTO admin_users (
    id,
    auth_user_id,
    email,
    role
  ) VALUES (
    uuid_generate_v4(),
    NULL,                          -- Preencher após criar auth user em produção
    v_admin_email,
    'super_admin'
  )
  ON CONFLICT (email) DO NOTHING;

  RAISE NOTICE 'Seed admin concluído para: %', v_admin_email;
  RAISE NOTICE 'LEMBRETE: Vincular auth_user_id após criar usuário no Supabase Auth Dashboard.';
  RAISE NOTICE 'LEMBRETE: MVP usa apenas super_admin. Outros papéis (support, financial, developer, viewer) ativados pós-MVP.';
END;
$$;

-- user_metadata para identificação de papel no JWT (opcional, para middleware)
-- Executar via Supabase Dashboard após criar o auth user:
--
-- UPDATE auth.users
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "super_admin", "is_admin": true}'::jsonb
-- WHERE email = 'admin@laraassistente.com.br';
