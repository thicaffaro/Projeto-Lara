-- =============================================================================
-- 0012_media_extras.sql
-- Prompt C2 — Suporte a mídia recebida + detector de urgência.
--
-- MUDANÇAS:
--   1. Índices de performance para retenção de mídia + export LGPD
--   2. Expande CHECK de lara_mode_decision em messages para incluir
--      'urgent_bypass' (notificação urgente, flow continua normalmente)
--   3. Expande CHECK de lara_mode_decision em audit_log da mesma forma
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Índices de performance para retenção/LGPD em messages
--    (novas partições herdam índices do pai, mas criamos aqui para clareza)
-- -----------------------------------------------------------------------------

-- Para a query de retenção diária (filtra mídias antigas ainda não deletadas)
CREATE INDEX IF NOT EXISTS idx_messages_media_retention
  ON messages (created_at)
  WHERE media_url IS NOT NULL AND media_url != 'deleted';

-- Para export LGPD por contato (lista todas as mídias de um contato)
CREATE INDEX IF NOT EXISTS idx_messages_contact_media
  ON messages (contact_id, created_at DESC)
  WHERE media_url IS NOT NULL;

-- Para busca rápida por tipo de mídia (analytics)
CREATE INDEX IF NOT EXISTS idx_messages_media_type
  ON messages (professional_id, message_type, created_at DESC)
  WHERE message_type != 'text';

-- -----------------------------------------------------------------------------
-- 2. Expandir lara_mode_decision em messages com 'urgent_bypass'
--
-- ESTRATÉGIA: Dropar e recriar o CHECK com o valor adicional.
-- DO NOT use ADD CONSTRAINT porque o CHECK é inline na definição de coluna
-- (Postgres não nomeia CHECKs inline automaticamente de forma previsível).
-- Usamos uma abordagem segura: adicionar via ALTER TABLE ADD CONSTRAINT.
-- -----------------------------------------------------------------------------

-- Primeiro, verificar se já existe o valor 'urgent_bypass' no CHECK.
-- Como não temos o nome do constraint original (inline em CREATE TABLE),
-- adicionamos um NOVO constraint nomeado que inclui todos os valores.
-- O constraint original (sem nome) permanece — se ele rejeitar, o novo faz nada.
-- Abordagem mais segura: ALTER TABLE... DROP CONSTRAINT se existir, depois recriar.

-- NOTA: O CHECK original em 0001 é unnamed (inline). Postgres nomeia como
-- "messages_lara_mode_decision_check". Usamos IF EXISTS para idempotência.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_lara_mode_decision_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_lara_mode_decision_check
  CHECK (lara_mode_decision IS NULL OR lara_mode_decision IN (
    'responded',
    'silent_personal',
    'silent_paused',
    'silent_blocked',
    'silent_out_of_scope',
    'urgent_bypass',
    'silent_media_only'
  ));

-- -----------------------------------------------------------------------------
-- 3. Expandir lara_mode_decision em audit_log (adicionado em 0011)
-- -----------------------------------------------------------------------------

ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_lara_mode_decision_check;

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_lara_mode_decision_check
  CHECK (lara_mode_decision IS NULL OR lara_mode_decision IN (
    'responded',
    'silent_personal',
    'silent_paused',
    'silent_blocked',
    'silent_out_of_scope',
    'urgent_bypass',
    'silent_media_only'
  ));

COMMENT ON CONSTRAINT messages_lara_mode_decision_check ON messages IS
  'Decisão da Lara. urgent_bypass = urgência detectada, notificação imediata, flow continua.
   silent_media_only = mídia sem texto, Lara não responde, profissional notificada.
   Adicionados em 0012_media_extras.sql (Prompt C2).';
