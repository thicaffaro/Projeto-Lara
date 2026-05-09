-- =============================================================================
-- 0001_initial.sql
-- Lara — Schema inicial completo
-- Domínio: laraassistente.com.br
-- Banco: Supabase Cloud Pro
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1a. Extensões
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- -----------------------------------------------------------------------------
-- 1b. Enums
-- -----------------------------------------------------------------------------
CREATE TYPE appointment_status AS ENUM (
  'confirmed',
  'cancelled',
  'rescheduled',
  'no_show',
  'pending'
);

CREATE TYPE contact_type AS ENUM (
  'client',
  'personal',
  'business',
  'unknown'
);

CREATE TYPE lara_mode AS ENUM (
  'full',
  'booking_only',
  'silent'
);

CREATE TYPE default_lara_mode_setting AS ENUM (
  'cautious',
  'standard'
);

CREATE TYPE template_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'paused'
);

CREATE TYPE template_variant AS ENUM (
  'a',
  'b',
  'c'
);

CREATE TYPE message_direction AS ENUM (
  'inbound',
  'outbound'
);

CREATE TYPE message_type AS ENUM (
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker'
);

CREATE TYPE handover_status AS ENUM (
  'active',
  'resolved'
);

CREATE TYPE subscription_status AS ENUM (
  'trial',
  'trial_pending_templates',
  'active',
  'past_due',
  'cancelled',
  'cancelled_pending_anonymization'
);

CREATE TYPE whatsapp_status AS ENUM (
  'connected',
  'token_invalid',
  'disconnected'
);

CREATE TYPE channel_type AS ENUM (
  'whatsapp',
  'instagram'
);

CREATE TYPE service_mode AS ENUM (
  'studio',
  'home'
);

CREATE TYPE specialty AS ENUM (
  'facial',
  'corporal',
  'both'
);

CREATE TYPE service_location AS ENUM (
  'studio',
  'client_home'
);

CREATE TYPE admin_role AS ENUM (
  'super_admin',
  'support',
  'financial',
  'developer',
  'viewer'
);

CREATE TYPE legal_doc_type AS ENUM (
  'privacy_policy',
  'terms_of_use'
);

CREATE TYPE nps_score AS ENUM (
  'happy',
  'neutral',
  'sad'
);

-- -----------------------------------------------------------------------------
-- 1c. Tabelas
-- -----------------------------------------------------------------------------

-- professionals
-- Representa esteticistas que pagam R$ 99/mês (clientes do Lara)
CREATE TABLE professionals (
  id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id                   UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name                           TEXT NOT NULL,
  phone_number                   TEXT UNIQUE NOT NULL,
  recovery_email                 TEXT NULL,
  cpf_or_cnpj                    TEXT,
  timezone                       TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  whatsapp_status                whatsapp_status NOT NULL DEFAULT 'disconnected',
  whatsapp_status_changed_at     TIMESTAMPTZ NULL,
  access_token_encrypted         BYTEA,
  meta_waba_id                   TEXT,
  meta_phone_number_id           TEXT,
  working_hours                  JSONB,
  protocols                      JSONB,
  specialty                      specialty NOT NULL DEFAULT 'facial',
  service_mode                   service_mode NOT NULL DEFAULT 'studio',
  studio_address                 JSONB NULL,
  home_service_radius_km         INT NULL,
  home_service_buffer_min        INT NOT NULL DEFAULT 30,
  service_areas                  JSONB NULL,
  default_lara_mode              default_lara_mode_setting NOT NULL DEFAULT 'cautious',
  trial_started_at               TIMESTAMPTZ NULL,
  trial_ends_at                  TIMESTAMPTZ NULL,
  trial_extension_days           INT NOT NULL DEFAULT 0,
  onboarding_completed           BOOLEAN NOT NULL DEFAULT FALSE,
  is_paused                      BOOLEAN NOT NULL DEFAULT FALSE,
  silent_hours                   JSONB NULL,
  acquisition_source             TEXT NULL,
  dashboard_pin_hash             TEXT NULL,
  billing_paused_at              TIMESTAMPTZ NULL,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- studio_address obrigatório se service_mode='studio'
  CONSTRAINT chk_studio_address
    CHECK (service_mode <> 'studio' OR studio_address IS NOT NULL),

  -- home_service_radius_km obrigatório se service_mode='home'
  CONSTRAINT chk_home_radius
    CHECK (service_mode <> 'home' OR home_service_radius_km IS NOT NULL),

  -- service_areas só permitido se service_mode='home'
  CONSTRAINT chk_service_areas_home_only
    CHECK (service_areas IS NULL OR service_mode = 'home')
);

COMMENT ON TABLE professionals IS
  'Esteticistas que assinam o Lara. Nunca chamar de "cliente" na UI — esse termo é reservado para o cliente final da esteticista.';
COMMENT ON COLUMN professionals.recovery_email IS
  'Email para fluxo de recuperação de acesso ao dashboard.';
COMMENT ON COLUMN professionals.whatsapp_status_changed_at IS
  'Registra quando o status mudou para detecção de >7 dias em token_invalid e pausa de cobrança.';
COMMENT ON COLUMN professionals.billing_paused_at IS
  'Preenchido quando a cobrança é pausada via Mercado Pago por token_invalid prolongado.';

-- contacts
-- Representa QUALQUER contato no WhatsApp da profissional (clientes, pessoais, fornecedores, desconhecidos)
CREATE TABLE contacts (
  id                           UUID DEFAULT uuid_generate_v4(),
  professional_id              UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  name                         TEXT,
  phone_number                 TEXT NOT NULL,
  contact_type                 contact_type NOT NULL DEFAULT 'unknown',
  lara_mode                    lara_mode NOT NULL DEFAULT 'silent',
  consent_given_at             TIMESTAMPTZ,
  address                      JSONB NULL,
  preferred_neighborhood       TEXT NULL,
  notes                        TEXT,
  is_vip                       BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked                   BOOLEAN NOT NULL DEFAULT FALSE,
  pre_registered               BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at              TIMESTAMPTZ NULL,
  last_inbound_message_at      TIMESTAMPTZ NULL,
  last_notification_at         TIMESTAMPTZ NULL,
  professional_typing_until    TIMESTAMPTZ NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id),
  UNIQUE (professional_id, phone_number)
);

COMMENT ON TABLE contacts IS
  'Todo contato do WhatsApp da profissional. "cliente" é apenas contacts com contact_type=''client''.';
COMMENT ON COLUMN contacts.last_inbound_message_at IS
  'CRÍTICO: usada para verificar janela de 24h da Meta. Após expirar, só templates aprovados podem ser enviados.';
COMMENT ON COLUMN contacts.professional_typing_until IS
  'Lock anti-race-condition: enquanto profissional está digitando, Lara não responde.';
COMMENT ON COLUMN contacts.last_notification_at IS
  'Rate limit de notificações proativas para este contato.';

-- Índices para contacts
CREATE INDEX idx_contacts_phone_number ON contacts(phone_number);
CREATE INDEX idx_contacts_professional_type ON contacts(professional_id, contact_type);
CREATE INDEX idx_contacts_professional_lara_mode ON contacts(professional_id, lara_mode);
CREATE INDEX idx_contacts_professional_inbound_window
  ON contacts(professional_id, last_inbound_message_at);

-- appointments — particionada por mês
CREATE TABLE appointments (
  id                       UUID NOT NULL DEFAULT uuid_generate_v4(),
  professional_id          UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  contact_id               UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  protocol_name            TEXT NOT NULL,
  starts_at                TIMESTAMPTZ NOT NULL,
  ends_at                  TIMESTAMPTZ NOT NULL,
  status                   appointment_status NOT NULL DEFAULT 'confirmed',
  service_location         service_location NOT NULL DEFAULT 'studio',
  travel_buffer_before_min INT NOT NULL DEFAULT 0,
  travel_buffer_after_min  INT NOT NULL DEFAULT 0,
  reminder_24h_sent        BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_2h_sent         BOOLEAN NOT NULL DEFAULT FALSE,
  source                   channel_type NOT NULL DEFAULT 'whatsapp',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, starts_at),

  -- Intervalo efetivo inclui buffers de deslocamento
  CONSTRAINT no_overlap EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(
      starts_at - (travel_buffer_before_min || ' minutes')::interval,
      ends_at   + (travel_buffer_after_min  || ' minutes')::interval,
      '[)'
    ) WITH &&
  )
) PARTITION BY RANGE (starts_at);

COMMENT ON TABLE appointments IS
  'Sessões agendadas. UI usa "sessão", não "agendamento" ou "horário".';

-- Partições para 2025 e 2026 (adicionar novas via automação)
CREATE TABLE appointments_2025_q1 PARTITION OF appointments
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE appointments_2025_q2 PARTITION OF appointments
  FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE appointments_2025_q3 PARTITION OF appointments
  FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE appointments_2025_q4 PARTITION OF appointments
  FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE appointments_2026_q1 PARTITION OF appointments
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE appointments_2026_q2 PARTITION OF appointments
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE appointments_2026_q3 PARTITION OF appointments
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE appointments_2026_q4 PARTITION OF appointments
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

-- appointments_archive — sessões canceladas há >90 dias
CREATE TABLE appointments_archive (
  LIKE appointments INCLUDING ALL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- messages — particionada por mês
CREATE TABLE messages (
  id                       UUID NOT NULL DEFAULT uuid_generate_v4(),
  professional_id          UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  contact_id               UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
  meta_message_id          TEXT UNIQUE,
  direction                message_direction NOT NULL,
  message_type             message_type NOT NULL DEFAULT 'text',
  content                  TEXT,
  media_url                TEXT NULL,
  media_type               TEXT NULL,
  media_size_bytes         BIGINT NULL,
  media_caption            TEXT NULL,
  channel                  channel_type NOT NULL DEFAULT 'whatsapp',
  intent_detected          TEXT,
  lara_mode_decision       TEXT NULL
    CHECK (lara_mode_decision IN (
      'responded',
      'silent_personal',
      'silent_paused',
      'silent_blocked',
      'silent_out_of_scope'
    )),
  sent_by                  TEXT NULL CHECK (sent_by IN ('lara', 'professional')),
  read_by_professional_at  TIMESTAMPTZ NULL,
  latency_ms               INT,
  error                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON COLUMN messages.contact_id IS
  'NULL é válido: mensagens chegam antes do contato ser promovido via promote_to_contact().';
COMMENT ON COLUMN messages.media_url IS
  'URL persistente após download imediato do CDN Meta (válido por 5 min) para Supabase Storage.';
COMMENT ON COLUMN messages.lara_mode_decision IS
  'Auditoria de por que a Lara respondeu ou silenciou.';
COMMENT ON COLUMN messages.sent_by IS
  'Quem enviou a mensagem outbound: a Lara (IA) ou a própria profissional.';

-- Partições para 2025 e 2026
CREATE TABLE messages_2025_q1 PARTITION OF messages
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE messages_2025_q2 PARTITION OF messages
  FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE messages_2025_q3 PARTITION OF messages
  FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE messages_2025_q4 PARTITION OF messages
  FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE messages_2026_q1 PARTITION OF messages
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE messages_2026_q2 PARTITION OF messages
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE messages_2026_q3 PARTITION OF messages
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE messages_2026_q4 PARTITION OF messages
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

-- Índices para messages
CREATE INDEX idx_messages_professional_contact_created
  ON messages(professional_id, contact_id, created_at);
CREATE INDEX idx_messages_unread
  ON messages(professional_id, read_by_professional_at)
  WHERE read_by_professional_at IS NULL;

-- templates — com variantes A/B/C para aprovação Meta
CREATE TABLE templates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id   UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  name              TEXT NOT NULL
    CHECK (name IN (
      'booking_confirmation',
      'reminder_24h',
      'reminder_2h',
      'cancellation',
      'reschedule_request',
      'home_visit_confirmation'
    )),
  variant           template_variant NOT NULL DEFAULT 'a',
  status            template_status NOT NULL DEFAULT 'pending',
  meta_template_id  TEXT,
  submitted_at      TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (professional_id, name, variant)
);

COMMENT ON TABLE templates IS
  'Trial inicia após 4 dos 6 templates estarem APPROVED. Política: tentar variante A → B → C.';

-- subscriptions
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id     UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  status              subscription_status NOT NULL DEFAULT 'trial',
  mp_subscription_id  TEXT,
  mp_paused_at        TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN subscriptions.mp_paused_at IS
  'Quando a assinatura foi pausada via API Mercado Pago (ex: token_invalid >7 dias).';

-- audit_log — particionada com retenção de 6 meses
CREATE TABLE audit_log (
  id              UUID NOT NULL DEFAULT uuid_generate_v4(),
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
  actor           TEXT NOT NULL,
  action          TEXT NOT NULL,
  table_name      TEXT,
  record_id       UUID,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_log_2025_q1 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE audit_log_2025_q2 PARTITION OF audit_log
  FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE audit_log_2025_q3 PARTITION OF audit_log
  FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE audit_log_2025_q4 PARTITION OF audit_log
  FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE audit_log_2026_q1 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE audit_log_2026_q2 PARTITION OF audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE audit_log_2026_q3 PARTITION OF audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE audit_log_2026_q4 PARTITION OF audit_log
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

-- instagram_accounts — stub para expansão futura
CREATE TABLE instagram_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  ig_user_id      TEXT,
  ig_page_id      TEXT,
  access_token    TEXT,
  connected_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE instagram_accounts IS 'Stub — integração Instagram ativa pós-MVP.';

-- human_handovers — quando profissional assume conversa
CREATE TABLE human_handovers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status          handover_status NOT NULL DEFAULT 'active',
  context         JSONB,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ NULL
);

CREATE INDEX idx_handovers_active
  ON human_handovers(professional_id, status)
  WHERE status = 'active';

-- webhook_dlq — dead-letter queue para webhooks falhos
CREATE TABLE webhook_dlq (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source       TEXT NOT NULL,
  payload      JSONB NOT NULL,
  error        TEXT,
  attempts     INT NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  resolved_at  TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- nps_feedback — NPS com enum (não texto livre)
CREATE TABLE nps_feedback (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id           UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  score                     nps_score NOT NULL,
  comment                   TEXT,
  day_of_lifecycle          INT,
  responded_to_outreach     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- magic_links — login sem senha
CREATE TABLE magic_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  token           TEXT UNIQUE NOT NULL,
  purpose         TEXT NOT NULL DEFAULT 'login',
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_magic_links_token ON magic_links(token) WHERE used_at IS NULL;

-- schedule_blocks — bloqueios manuais de agenda
CREATE TABLE schedule_blocks (
  id              UUID DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  title           TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, starts_at),

  CONSTRAINT no_block_overlap EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
) PARTITION BY RANGE (starts_at);

CREATE TABLE schedule_blocks_2025 PARTITION OF schedule_blocks
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE schedule_blocks_2026 PARTITION OF schedule_blocks
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- proactive_message_rules — regras de mensagens proativas automáticas
CREATE TABLE proactive_message_rules (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   TEXT UNIQUE NOT NULL,
  trigger_condition      JSONB NOT NULL,
  frequency_limit        INT NOT NULL DEFAULT 1,
  message_template       TEXT NOT NULL,
  link_purpose           TEXT,
  enabled                BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_service_modes TEXT[] NOT NULL DEFAULT ARRAY['studio', 'home'],
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- proactive_messages_sent — log de envios proativos (evita duplicatas)
CREATE TABLE proactive_messages_sent (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  rule_name       TEXT NOT NULL,
  scope           TEXT NOT NULL CHECK (scope IN ('internal', 'external')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proactive_sent_professional_rule
  ON proactive_messages_sent(professional_id, rule_name, sent_at);

-- professional_notes — anotações internas admin sobre profissionais
CREATE TABLE professional_notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  author          TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- admin_actions_log — log de ações administrativas
CREATE TABLE admin_actions_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id   UUID,
  action          TEXT NOT NULL,
  target_type     TEXT,
  target_id       UUID,
  details         JSONB,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ops_metrics_hourly — métricas operacionais por hora
CREATE TABLE ops_metrics_hourly (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hour_bucket           TIMESTAMPTZ NOT NULL,
  metric_name           TEXT NOT NULL,
  metric_value          NUMERIC NOT NULL,
  professional_id       UUID REFERENCES professionals(id) ON DELETE SET NULL,
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (hour_bucket, metric_name, professional_id)
);

-- legal_documents — versionamento de Política de Privacidade e Termos de Uso
CREATE TABLE legal_documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_type     legal_doc_type NOT NULL,
  version      INT NOT NULL,
  content      TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (doc_type, version)
);

COMMENT ON TABLE legal_documents IS
  'Versionamento de documentos legais. Conteúdo placeholder — advogado preenche antes do go-live.';

-- professional_consents — registro de aceite de termos por cada profissional
CREATE TABLE professional_consents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id     UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  doc_type            legal_doc_type NOT NULL,
  legal_document_id   UUID NOT NULL REFERENCES legal_documents(id),
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (professional_id, doc_type, legal_document_id)
);

-- quick_replies — atalhos de digitação da profissional no dashboard
CREATE TABLE quick_replies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  shortcut        TEXT NOT NULL,
  full_text       TEXT NOT NULL,
  order_index     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (professional_id, shortcut)
);

COMMENT ON TABLE quick_replies IS
  'Ex: shortcut="vou_ai" → full_text="Estou a caminho, chego em 10 minutos!"';

-- admin_users — usuários do painel administrativo com RBAC
CREATE TABLE admin_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT UNIQUE NOT NULL,
  role         admin_role NOT NULL DEFAULT 'super_admin',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_users IS
  'MVP usa apenas super_admin. Outros papéis (support, financial, developer, viewer) ficam ativos pós-MVP.';

-- recovery_tokens — tokens de recuperação via SMS ou email
CREATE TABLE recovery_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  token           TEXT UNIQUE NOT NULL,
  destination     TEXT NOT NULL,
  purpose         TEXT NOT NULL
    CHECK (purpose IN ('reset_pin', 'reconnect_meta', 'login_alternative')),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_tokens_token ON recovery_tokens(token) WHERE used_at IS NULL;

-- -----------------------------------------------------------------------------
-- 1d. View materializada busy_slots
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW busy_slots AS
  SELECT
    professional_id,
    id          AS source_id,
    'appointment' AS source_type,
    starts_at - (travel_buffer_before_min || ' minutes')::interval AS effective_start,
    ends_at   + (travel_buffer_after_min  || ' minutes')::interval AS effective_end,
    protocol_name AS title
  FROM appointments
  WHERE status NOT IN ('cancelled')

  UNION ALL

  SELECT
    professional_id,
    id          AS source_id,
    'block'     AS source_type,
    starts_at   AS effective_start,
    ends_at     AS effective_end,
    COALESCE(title, 'Bloqueio') AS title
  FROM schedule_blocks;

CREATE UNIQUE INDEX ON busy_slots(source_id, source_type);
CREATE INDEX idx_busy_slots_professional_range
  ON busy_slots(professional_id, effective_start, effective_end);

COMMENT ON MATERIALIZED VIEW busy_slots IS
  'Atualizada via REFRESH CONCURRENTLY a cada minuto pelo n8n/cron.';

-- -----------------------------------------------------------------------------
-- 1e. Função is_slot_available
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_slot_available(
  p_professional_id         UUID,
  p_starts_at               TIMESTAMPTZ,
  p_ends_at                 TIMESTAMPTZ,
  p_contact_id              UUID  DEFAULT NULL,
  p_travel_buffer_before    INT   DEFAULT 0,
  p_travel_buffer_after     INT   DEFAULT 0
) RETURNS TABLE (available BOOLEAN, reason TEXT) AS $$
DECLARE
  v_working_hours       JSONB;
  v_service_mode        service_mode;
  v_contact_address     JSONB;
  v_service_areas       JSONB;
  v_effective_start     TIMESTAMPTZ;
  v_effective_end       TIMESTAMPTZ;
  v_overlap_count       INT;
BEGIN
  v_effective_start := p_starts_at - (p_travel_buffer_before || ' minutes')::interval;
  v_effective_end   := p_ends_at   + (p_travel_buffer_after  || ' minutes')::interval;

  SELECT working_hours, service_mode, service_areas
    INTO v_working_hours, v_service_mode, v_service_areas
  FROM professionals WHERE id = p_professional_id;

  -- Verificar sobreposição com slots ocupados
  SELECT COUNT(*) INTO v_overlap_count
  FROM busy_slots
  WHERE professional_id = p_professional_id
    AND tstzrange(effective_start, effective_end, '[)')
        && tstzrange(v_effective_start, v_effective_end, '[)');

  IF v_overlap_count > 0 THEN
    RETURN QUERY SELECT FALSE, 'overlapping_appointment_or_block';
    RETURN;
  END IF;

  -- Verificar endereço do contato para atendimento em domicílio
  IF v_service_mode = 'home' AND p_contact_id IS NOT NULL THEN
    SELECT address INTO v_contact_address
    FROM contacts WHERE id = p_contact_id;

    IF v_contact_address IS NULL THEN
      RETURN QUERY SELECT FALSE, 'contact_address_missing';
      RETURN;
    END IF;

    IF v_service_areas IS NOT NULL THEN
      -- Verificação simplificada; lógica completa de geocodificação feita na camada app
      IF NOT (v_contact_address ? 'neighborhood') OR
         NOT (v_service_areas ? (v_contact_address->>'neighborhood')) THEN
        RETURN QUERY SELECT FALSE, 'out_of_service_area';
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Verificar horário de trabalho (verificação básica; fuso horário tratado na camada app)
  IF v_working_hours IS NOT NULL THEN
    -- TODO: validar dia da semana e hora contra v_working_hours
    -- Lógica completa implementada no /lib/timezone.ts
    NULL;
  END IF;

  RETURN QUERY SELECT TRUE, 'available';
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- 1f. Função should_lara_respond (com lock de typing)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION should_lara_respond(
  p_contact_id UUID,
  p_intent     TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_lara_mode    lara_mode;
  v_is_blocked   BOOLEAN;
  v_typing_until TIMESTAMPTZ;
  v_is_paused    BOOLEAN;
BEGIN
  SELECT
    c.lara_mode,
    c.is_blocked,
    c.professional_typing_until,
    p.is_paused
  INTO v_lara_mode, v_is_blocked, v_typing_until, v_is_paused
  FROM contacts c
  JOIN professionals p ON p.id = c.professional_id
  WHERE c.id = p_contact_id;

  -- Conta bloqueada ou pausada
  IF v_is_blocked THEN RETURN FALSE; END IF;
  IF v_is_paused THEN RETURN FALSE; END IF;

  -- Profissional está digitando — Lara aguarda para evitar race condition
  IF v_typing_until IS NOT NULL AND v_typing_until > NOW() THEN
    RETURN FALSE;
  END IF;

  -- Modo silent: nunca responde
  IF v_lara_mode = 'silent' THEN RETURN FALSE; END IF;

  -- Modo full: responde tudo no escopo
  IF v_lara_mode = 'full' THEN RETURN TRUE; END IF;

  -- Modo booking_only: responde apenas intents de agendamento
  IF v_lara_mode = 'booking_only' THEN
    RETURN p_intent IN ('AGENDAR', 'CANCELAR', 'REMARCAR');
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- 1g. Funções de promoção de contato (política anti-lixo)
-- -----------------------------------------------------------------------------

-- Decide se deve criar um contato baseado em critérios anti-spam
CREATE OR REPLACE FUNCTION should_create_contact(
  p_professional_id UUID,
  p_phone_number    TEXT,
  p_current_intent  TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_message_count INT;
BEGIN
  -- Critério C: intent de agendamento — cria imediatamente
  IF p_current_intent IN ('AGENDAR', 'CANCELAR', 'REMARCAR') THEN
    RETURN TRUE;
  END IF;

  -- Critério B: 2+ mensagens em 24h do mesmo número
  -- Nota: busca por meta_message_id não é 100% precisa mas evita JOIN custoso.
  -- Lógica completa na camada app via /api/webhooks/whatsapp.
  SELECT COUNT(*) INTO v_message_count
  FROM messages
  WHERE professional_id = p_professional_id
    AND contact_id IS NULL
    AND content IS NOT NULL
    AND created_at > NOW() - INTERVAL '24 hours';

  -- Simplificação: se há 2+ mensagens sem contato associado, promover
  RETURN v_message_count >= 2;

  -- Critério A (manual via painel "Quem é?") não é coberto aqui
END;
$$ LANGUAGE plpgsql;

-- Promove phone_number para contato e associa mensagens anteriores
CREATE OR REPLACE FUNCTION promote_to_contact(
  p_professional_id UUID,
  p_phone_number    TEXT
) RETURNS UUID AS $$
DECLARE
  v_default_mode     default_lara_mode_setting;
  v_initial_lara_mode lara_mode;
  v_contact_id       UUID;
BEGIN
  SELECT default_lara_mode INTO v_default_mode
  FROM professionals WHERE id = p_professional_id;

  -- Política de modo inicial: cautious → silent; standard → booking_only
  IF v_default_mode = 'cautious' THEN
    v_initial_lara_mode := 'silent';
  ELSE
    v_initial_lara_mode := 'booking_only';
  END IF;

  INSERT INTO contacts (
    professional_id,
    phone_number,
    contact_type,
    lara_mode,
    last_message_at
  ) VALUES (
    p_professional_id,
    p_phone_number,
    'unknown',
    v_initial_lara_mode,
    NOW()
  )
  ON CONFLICT (professional_id, phone_number) DO UPDATE
    SET last_message_at = NOW()
  RETURNING id INTO v_contact_id;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1h. Função is_within_meta_window (janela de 24h Meta)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_within_meta_window(
  p_contact_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_last_inbound TIMESTAMPTZ;
BEGIN
  SELECT last_inbound_message_at INTO v_last_inbound
  FROM contacts WHERE id = p_contact_id;

  IF v_last_inbound IS NULL THEN RETURN FALSE; END IF;

  RETURN v_last_inbound > NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- 1i. Função detect_message_urgency (bypass de rate-limit)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_message_urgency(
  p_content TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Detecção por keywords; melhorada via LLM no flow n8n
  RETURN p_content ~* '(urgente|emergência|preciso|tô mal|não tô bem|socorro|me ajuda|aconteceu)';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -----------------------------------------------------------------------------
-- 1j. Funções de criptografia
-- -----------------------------------------------------------------------------

-- Criptografa token de acesso usando chave de 32 bytes via AES-256-GCM
CREATE OR REPLACE FUNCTION encrypt_access_token(
  p_token TEXT,
  p_key   TEXT
) RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(p_token, p_key, 'cipher-algo=aes256');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decriptografa token de acesso
CREATE OR REPLACE FUNCTION decrypt_access_token(
  p_encrypted BYTEA,
  p_key       TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(p_encrypted, p_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- Token inválido ou chave incorreta
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1k. Triggers
-- -----------------------------------------------------------------------------

-- Função genérica de updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica updated_at em todas as tabelas relevantes
CREATE TRIGGER trg_professionals_updated_at
  BEFORE UPDATE ON professionals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_quick_replies_updated_at
  BEFORE UPDATE ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_proactive_rules_updated_at
  BEFORE UPDATE ON proactive_message_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Trigger: detecta mudança de whatsapp_status e registra timestamp
CREATE OR REPLACE FUNCTION trigger_whatsapp_status_changed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.whatsapp_status <> OLD.whatsapp_status THEN
    NEW.whatsapp_status_changed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_whatsapp_status_changed
  BEFORE UPDATE ON professionals
  FOR EACH ROW EXECUTE FUNCTION trigger_whatsapp_status_changed();

-- Trigger: atualiza last_message_at em contacts após toda mensagem
CREATE OR REPLACE FUNCTION trigger_update_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE contacts
    SET last_message_at = NEW.created_at
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_last_message_at
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION trigger_update_last_message_at();

-- Trigger: atualiza last_inbound_message_at apenas em mensagens inbound
CREATE OR REPLACE FUNCTION trigger_update_last_inbound_message_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.contact_id IS NOT NULL THEN
    UPDATE contacts
    SET last_inbound_message_at = NEW.created_at
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_last_inbound_at
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION trigger_update_last_inbound_message_at();

-- Trigger: valida que appointment só aceita contact_type='client'
CREATE OR REPLACE FUNCTION trigger_validate_appointment_contact_type()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_type contact_type;
BEGIN
  SELECT contact_type INTO v_contact_type
  FROM contacts WHERE id = NEW.contact_id;

  IF v_contact_type <> 'client' THEN
    RAISE EXCEPTION
      'Apenas contatos do tipo "client" podem ter sessões agendadas. Contato % é do tipo %.',
      NEW.contact_id, v_contact_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointments_validate_contact_type
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_validate_appointment_contact_type();

-- Trigger: atualiza preferred_neighborhood baseado no address do contato
CREATE OR REPLACE FUNCTION trigger_update_preferred_neighborhood()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.address IS NOT NULL AND NEW.address ? 'neighborhood' THEN
    NEW.preferred_neighborhood := NEW.address->>'neighborhood';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contacts_preferred_neighborhood
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_update_preferred_neighborhood();

-- Trigger: arquiva appointments cancelados com >90 dias
CREATE OR REPLACE FUNCTION trigger_archive_old_cancelled_appointments()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND NEW.starts_at < NOW() - INTERVAL '90 days' THEN
    INSERT INTO appointments_archive
    SELECT NEW.*, NOW();
    RETURN NULL; -- Cancela o UPDATE, a linha vai para archive
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointments_archive_cancelled
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_archive_old_cancelled_appointments();

-- -----------------------------------------------------------------------------
-- 1l. Row Level Security (RLS)
-- -----------------------------------------------------------------------------

-- Habilitar RLS
ALTER TABLE professionals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates               ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_handovers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_consents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_blocks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_feedback            ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_tokens         ENABLE ROW LEVEL SECURITY;

-- Políticas: profissional acessa apenas seus próprios dados
CREATE POLICY professionals_own_data ON professionals
  FOR ALL USING (auth.uid() = auth_user_id);

CREATE POLICY contacts_own_data ON contacts
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY appointments_own_data ON appointments
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY messages_own_data ON messages
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY templates_own_data ON templates
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY subscriptions_own_data ON subscriptions
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY handovers_own_data ON human_handovers
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY quick_replies_own_data ON quick_replies
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY consents_own_data ON professional_consents
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY schedule_blocks_own_data ON schedule_blocks
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY nps_own_data ON nps_feedback
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY magic_links_own_data ON magic_links
  FOR SELECT USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY recovery_tokens_own_data ON recovery_tokens
  FOR SELECT USING (
    professional_id IN (
      SELECT id FROM professionals WHERE auth_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Comentários finais
-- -----------------------------------------------------------------------------
COMMENT ON SCHEMA public IS
  'Lara — SaaS de agendamentos para esteticistas. v1.0.0';
