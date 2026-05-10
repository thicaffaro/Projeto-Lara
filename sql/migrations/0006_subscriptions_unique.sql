-- =============================================================================
-- 0006_subscriptions_unique.sql
-- Adiciona UNIQUE constraint em subscriptions.professional_id e coluna cancelled_at.
--
-- MOTIVO DO UNIQUE:
--   Sem esta constraint, upsert com onConflict:'professional_id' cria múltiplas
--   linhas para o mesmo professional → cobranças duplicadas em produção.
--   Deve ser adicionado ANTES do go-live.
--
-- MOTIVO DO cancelled_at:
--   Registra o momento exato do cancelamento para auditoria e cálculo de
--   acesso proporcional (ex: acesso até fim do período pago).
-- =============================================================================

-- Adiciona UNIQUE constraint (idempotente via IF NOT EXISTS no índice)
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_professional_id_unique
  UNIQUE (professional_id);

-- Adiciona coluna cancelled_at (NULLABLE — preenchida apenas em cancelamento)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;

COMMENT ON CONSTRAINT subscriptions_professional_id_unique ON subscriptions IS
  'Garante uma assinatura por profissional. Sem esta constraint, upsert pode criar duplicatas.';

COMMENT ON COLUMN subscriptions.cancelled_at IS
  'Preenchido pelo webhook Mercado Pago em subscription_preapproval.cancelled.
   NÃO confundir com is_paused em professionals (suspensão temporária por token_invalid).';
