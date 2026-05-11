-- =============================================================================
-- 0008_dashboard.sql
-- Dashboard da profissional: sessões, PIN DB-based, magic link tokens.
--
-- NOTAS DE COMPATIBILIDADE:
-- - last_notification_at, sent_by, lara_mode_decision já existem em 0001_initial.sql
-- - dashboard_pin_hash já existe em professionals (Prompt B3)
-- - magic_links já existe — esta migration adiciona dashboard_sessions
-- - Todos os ALTER usam IF NOT EXISTS para idempotência
-- =============================================================================

-- Índices de performance para a aba Conversas (se não existirem)
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (professional_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_latest_per_contact
  ON messages (contact_id, created_at DESC);

-- PIN management no banco (complementa o Redis rate-limit do Prompt B3)
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS pin_hash          TEXT        NULL;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS pin_attempts      INT         NOT NULL DEFAULT 0;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS pin_locked_until  TIMESTAMPTZ NULL;

-- Copia dashboard_pin_hash → pin_hash para compatibilidade retroativa (B3)
UPDATE professionals
SET pin_hash = dashboard_pin_hash
WHERE dashboard_pin_hash IS NOT NULL
  AND pin_hash IS NULL;

COMMENT ON COLUMN professionals.pin_hash IS
  'PIN hash bcrypt (cost 12). Equivalente a dashboard_pin_hash do B3 — unificados aqui.';
COMMENT ON COLUMN professionals.pin_attempts IS
  'Contador de tentativas erradas de PIN. Resetado após sucesso ou expiração do lock.';
COMMENT ON COLUMN professionals.pin_locked_until IS
  'Até quando o PIN está bloqueado após 5 tentativas erradas (15min de lock).';

-- Sessões do dashboard (cookie httpOnly dashboard_session)
CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  session_token   TEXT NOT NULL UNIQUE,
  device_info     TEXT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_token
  ON dashboard_sessions (session_token);
  -- WHERE expires_at > NOW() removido: NOW() não é IMMUTABLE em predicado de índice

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_professional
  ON dashboard_sessions (professional_id, expires_at DESC);

ALTER TABLE dashboard_sessions ENABLE ROW LEVEL SECURITY;

-- Profissional acessa apenas suas próprias sessões
DROP POLICY IF EXISTS dashboard_sessions_own ON dashboard_sessions;
CREATE POLICY dashboard_sessions_own ON dashboard_sessions
  FOR ALL USING (professional_id IN (
    SELECT id FROM professionals WHERE auth_user_id = auth.uid()
  ));

-- Trigger: atualiza last_active_at automaticamente
CREATE OR REPLACE FUNCTION trigger_session_last_active()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.session_token = OLD.session_token THEN
    NEW.last_active_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dashboard_session_last_active ON dashboard_sessions;
CREATE TRIGGER trg_dashboard_session_last_active
  BEFORE UPDATE ON dashboard_sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_session_last_active();
