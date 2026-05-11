-- =============================================================================
-- 0009_dashboard_extras.sql
-- Identidade da Lara + extensão de admin_actions_log
-- =============================================================================

-- Coluna de identidade/configurações da Lara (nome, tom, emojis)
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS lara_settings JSONB
  DEFAULT '{"name":"Lara","tone":"warm","emojis":true}'::jsonb;

COMMENT ON COLUMN professionals.lara_settings IS
  'Configurações de identidade da Lara: {"name":"Lara","tone":"warm","emojis":true}';

-- admin_actions_log já existe (0001_initial.sql), adiciona professional_id se faltando
ALTER TABLE admin_actions_log
  ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_prof
  ON admin_actions_log (professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_created
  ON admin_actions_log (created_at DESC);
