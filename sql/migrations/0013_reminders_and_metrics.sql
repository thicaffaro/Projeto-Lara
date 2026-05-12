-- =============================================================================
-- 0013_reminders_and_metrics.sql
-- Prompt: Flows n8n operacionais
--
-- NOTA: reminder_24h_sent e reminder_2h_sent já existem em appointments
--       (definidos em 0001_initial.sql). ops_metrics_hourly também
--       já existe. Esta migration adiciona:
--   1. Índice para cron de lembretes
--   2. RPC get_latency_percentiles para health-metrics
--   3. Índice para performance das métricas
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Índice para o cron de lembretes (/api/n8n/reminders)
--    Filtra por starts_at + status para achar appointments que precisam de lembrete.
--    NÃO usa colunas STABLE (sem NOW()) — compatível com partial index em PG 17.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_reminders_pending
  ON appointments (starts_at, professional_id)
  WHERE status = 'confirmed';

-- Índice separado para lembrete 24h pendente
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_24h
  ON appointments (starts_at, professional_id)
  WHERE reminder_24h_sent = FALSE AND status = 'confirmed';

-- Índice separado para lembrete 2h pendente
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_2h
  ON appointments (starts_at, professional_id)
  WHERE reminder_2h_sent = FALSE AND status = 'confirmed';

-- ---------------------------------------------------------------------------
-- 2. RPC get_latency_percentiles — usada pelo health-metrics cron
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_latency_percentiles(p_since TIMESTAMPTZ)
RETURNS TABLE(p50 INTEGER, p95 INTEGER, p99 INTEGER)
LANGUAGE sql
STABLE
AS $$
  SELECT
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms)::INTEGER AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::INTEGER AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::INTEGER AS p99
  FROM messages
  WHERE latency_ms IS NOT NULL
    AND created_at > p_since;
$$;

COMMENT ON FUNCTION get_latency_percentiles IS
  'Retorna p50/p95/p99 de latency_ms da última hora. Usado pelo flow_health_metrics.';

-- ---------------------------------------------------------------------------
-- 3. Índice de performance para ops_metrics_hourly
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ops_metrics_hour_bucket
  ON ops_metrics_hourly (hour_bucket DESC, metric_name);
