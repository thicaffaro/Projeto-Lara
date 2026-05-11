-- =============================================================================
-- 0010_partitions_2027.sql
-- Partições mensais de 2027 para appointments, messages e audit_log.
--
-- CONTEXTO:
--   As tabelas particionadas foram criadas em 0001_initial.sql com partições
--   pré-definidas até 2026-12. O trigger ensure_partition_exists cria
--   partições sob demanda, mas é boa prática criá-las antecipadamente para
--   evitar overhead no primeiro INSERT do mês e garantir que cron jobs de
--   manutenção (n8n) encontrem as partições existentes.
--
--   schedule_blocks_2027 já foi criado em 0001_initial.sql.
--
-- EXECUÇÃO:
--   Idempotente via IF NOT EXISTS — seguro executar múltiplas vezes.
--   Executar antes de janeiro de 2027 ou como parte do setup inicial.
--
-- NOTA:
--   ensure_partition_exists() replica automaticamente RLS policies e GRANTs
--   do pai para cada partição. Este script cria partições diretamente, mas
--   o RLS no pai (tabela particionada) já protege via herança de policy.
--   Para acesso direto à partição (n8n, psql), executar manualmente:
--     ALTER TABLE <partição> ENABLE ROW LEVEL SECURITY;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- appointments — partições mensais 2027
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments_2027_01
  PARTITION OF appointments FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS appointments_2027_02
  PARTITION OF appointments FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS appointments_2027_03
  PARTITION OF appointments FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS appointments_2027_04
  PARTITION OF appointments FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS appointments_2027_05
  PARTITION OF appointments FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS appointments_2027_06
  PARTITION OF appointments FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS appointments_2027_07
  PARTITION OF appointments FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE IF NOT EXISTS appointments_2027_08
  PARTITION OF appointments FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE IF NOT EXISTS appointments_2027_09
  PARTITION OF appointments FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE IF NOT EXISTS appointments_2027_10
  PARTITION OF appointments FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE IF NOT EXISTS appointments_2027_11
  PARTITION OF appointments FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE IF NOT EXISTS appointments_2027_12
  PARTITION OF appointments FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- -----------------------------------------------------------------------------
-- messages — partições mensais 2027
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages_2027_01
  PARTITION OF messages FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS messages_2027_02
  PARTITION OF messages FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS messages_2027_03
  PARTITION OF messages FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS messages_2027_04
  PARTITION OF messages FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS messages_2027_05
  PARTITION OF messages FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS messages_2027_06
  PARTITION OF messages FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS messages_2027_07
  PARTITION OF messages FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE IF NOT EXISTS messages_2027_08
  PARTITION OF messages FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE IF NOT EXISTS messages_2027_09
  PARTITION OF messages FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE IF NOT EXISTS messages_2027_10
  PARTITION OF messages FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE IF NOT EXISTS messages_2027_11
  PARTITION OF messages FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE IF NOT EXISTS messages_2027_12
  PARTITION OF messages FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- -----------------------------------------------------------------------------
-- audit_log — partições mensais 2027
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log_2027_01
  PARTITION OF audit_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_02
  PARTITION OF audit_log FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_03
  PARTITION OF audit_log FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_04
  PARTITION OF audit_log FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_05
  PARTITION OF audit_log FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_06
  PARTITION OF audit_log FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_07
  PARTITION OF audit_log FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_08
  PARTITION OF audit_log FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_09
  PARTITION OF audit_log FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_10
  PARTITION OF audit_log FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_11
  PARTITION OF audit_log FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE IF NOT EXISTS audit_log_2027_12
  PARTITION OF audit_log FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- -----------------------------------------------------------------------------
-- Verificação pós-execução
-- -----------------------------------------------------------------------------
-- SELECT inhrelid::regclass AS partition
-- FROM pg_inherits
-- WHERE inhparent = 'appointments'::regclass
--   AND inhrelid::regclass::TEXT LIKE '%2027%'
-- ORDER BY partition;
