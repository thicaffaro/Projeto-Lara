-- =============================================================================
-- 0011_dashboard_extras.sql
-- Complementos do Prompt D (Parte 3/3).
--
-- NOTA: lara_settings foi adicionado em 0009_dashboard_extras.sql.
--       admin_actions_log foi criado em 0001_initial.sql com professional_id
--       adicionado em 0009. Este arquivo é idempotente e não duplica nada.
--
-- ADIÇÕES:
--   1. lara_mode_decision em audit_log — permite filtrar eventos por decisão
--      da Lara (campo derivado do contexto, gravado pelo n8n/flow).
--   2. Índice de busca em audit_log por actor (para filtros de auditoria).
--   3. Garantias idempotentes das colunas que poderiam ter sido esquecidas.
-- =============================================================================

-- audit_log: adiciona lara_mode_decision para filtros na página de auditoria
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS lara_mode_decision TEXT NULL
    CHECK (lara_mode_decision IS NULL OR lara_mode_decision IN (
      'responded', 'silent_personal', 'silent_paused',
      'silent_blocked', 'silent_out_of_scope'
    ));

COMMENT ON COLUMN audit_log.lara_mode_decision IS
  'Decisão da Lara associada ao evento de auditoria, quando aplicável.
   Igual ao enum em messages.lara_mode_decision.
   Gravado pelo n8n ou flowInbound ao registrar eventos de mensagem.';

CREATE INDEX IF NOT EXISTS idx_audit_log_lara_decision
  ON audit_log (lara_mode_decision, created_at DESC)
  WHERE lara_mode_decision IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON audit_log (actor, created_at DESC);

-- lara_settings: garante a coluna (já existe via 0009, IF NOT EXISTS é seguro)
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS lara_settings JSONB
  DEFAULT '{"name":"Lara","tone":"warm","emojis":true}'::jsonb;

-- admin_actions_log: garante que a tabela existe (já criada no 0001 / 0009)
CREATE TABLE IF NOT EXISTS admin_actions_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id    UUID        REFERENCES auth.users(id),
  professional_id  UUID        REFERENCES professionals(id) ON DELETE SET NULL,
  action           TEXT        NOT NULL,
  details          JSONB,
  ip_address       INET,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_prof_v2
  ON admin_actions_log (professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_created_v2
  ON admin_actions_log (created_at DESC);
