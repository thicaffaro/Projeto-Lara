-- =============================================================================
-- 0001_initial.sql  (v2 — corrigido)
-- Lara — Schema inicial completo
-- Domínio: laraassistente.com.br
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
  'confirmed', 'cancelled', 'rescheduled', 'no_show', 'pending'
);
CREATE TYPE contact_type AS ENUM (
  'client', 'personal', 'business', 'unknown'
);
CREATE TYPE lara_mode AS ENUM (
  'full', 'booking_only', 'silent'
);
CREATE TYPE default_lara_mode_setting AS ENUM (
  'cautious', 'standard'
);
CREATE TYPE template_status AS ENUM (
  'pending', 'approved', 'rejected', 'paused'
);
CREATE TYPE template_variant AS ENUM ('a', 'b', 'c');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_type AS ENUM (
  'text', 'image', 'audio', 'video', 'document', 'sticker'
);
CREATE TYPE handover_status AS ENUM ('active', 'resolved');
CREATE TYPE subscription_status AS ENUM (
  'trial', 'trial_pending_templates', 'active',
  'past_due', 'cancelled', 'cancelled_pending_anonymization'
);
CREATE TYPE whatsapp_status AS ENUM (
  'connected', 'token_invalid', 'disconnected'
);
CREATE TYPE channel_type AS ENUM ('whatsapp', 'instagram');
CREATE TYPE service_mode AS ENUM ('studio', 'home');
CREATE TYPE specialty AS ENUM ('facial', 'corporal', 'both');
CREATE TYPE service_location AS ENUM ('studio', 'client_home');
CREATE TYPE admin_role AS ENUM (
  'super_admin', 'support', 'financial', 'developer', 'viewer'
);
CREATE TYPE legal_doc_type AS ENUM ('privacy_policy', 'terms_of_use');
CREATE TYPE nps_score AS ENUM ('happy', 'neutral', 'sad');

-- -----------------------------------------------------------------------------
-- 1c. Tabelas
-- -----------------------------------------------------------------------------

-- professionals
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
  -- Estrutura esperada: {"1":{"start":"09:00","end":"18:00"}, "7":null}
  -- Chave: ISO day-of-week (1=segunda, 7=domingo). NULL = dia fechado.
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

  CONSTRAINT chk_studio_address
    CHECK (service_mode <> 'studio' OR studio_address IS NOT NULL),
  CONSTRAINT chk_home_radius
    CHECK (service_mode <> 'home' OR home_service_radius_km IS NOT NULL),
  CONSTRAINT chk_service_areas_home_only
    CHECK (service_areas IS NULL OR service_mode = 'home')
);

COMMENT ON TABLE professionals IS
  'Esteticistas que assinam o Lara a R$ 99/mês. Nunca chamar de "cliente" na UI.';
COMMENT ON COLUMN professionals.working_hours IS
  'JSONB: {"1":{"start":"09:00","end":"18:00"},...,"7":null}. Chave=ISO weekday, null=fechado.';
COMMENT ON COLUMN professionals.whatsapp_status_changed_at IS
  'Detectar >7 dias em token_invalid para pausar cobrança.';
COMMENT ON COLUMN professionals.billing_paused_at IS
  'Preenchido quando cobrança é pausada via MP por token_invalid prolongado.';

-- contacts
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

COMMENT ON COLUMN contacts.last_inbound_message_at IS
  'CRÍTICO: janela 24h Meta. Após expirar, só templates aprovados podem ser enviados.';
COMMENT ON COLUMN contacts.professional_typing_until IS
  'Lock anti-race: enquanto profissional está digitando, Lara não responde.';

CREATE INDEX idx_contacts_phone_number             ON contacts(phone_number);
CREATE INDEX idx_contacts_professional_type        ON contacts(professional_id, contact_type);
CREATE INDEX idx_contacts_professional_lara_mode   ON contacts(professional_id, lara_mode);
CREATE INDEX idx_contacts_inbound_window
  ON contacts(professional_id, last_inbound_message_at);

-- orphan_messages
-- Armazena mensagens de números desconhecidos ANTES da promoção a contato.
-- Fluxo: should_create_contact=FALSE → INSERT aqui.
--        promote_to_contact() → move tudo para messages com contact_id.
CREATE TABLE orphan_messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id  UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  phone_number     TEXT NOT NULL,          -- remetente ainda sem contato criado
  meta_message_id  TEXT UNIQUE,
  direction        message_direction NOT NULL DEFAULT 'inbound',
  message_type     message_type NOT NULL DEFAULT 'text',
  content          TEXT,
  media_url        TEXT NULL,
  media_type       TEXT NULL,
  media_size_bytes BIGINT NULL,
  media_caption    TEXT NULL,
  channel          channel_type NOT NULL DEFAULT 'whatsapp',
  intent_detected  TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE orphan_messages IS
  'Mensagens de números não reconhecidos. Movidas para messages via promote_to_contact().';

CREATE INDEX idx_orphan_messages_lookup
  ON orphan_messages(professional_id, phone_number, created_at);

-- appointments — particionada MENSALMENTE por starts_at
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

  PRIMARY KEY (id, starts_at)
  -- NOTA: EXCLUDE USING gist não é suportado em tabelas particionadas (PG 17).
  -- A verificação de sobreposição é feita pela RPC is_slot_available().
) PARTITION BY RANGE (starts_at);

COMMENT ON TABLE appointments IS
  'UI usa "sessão". Particionada mensalmente. ensure_partition_exists cria partições sob demanda.';

-- Partições mensais 2025 (Jan–Dez)
CREATE TABLE appointments_2025_01 PARTITION OF appointments FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE appointments_2025_02 PARTITION OF appointments FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE appointments_2025_03 PARTITION OF appointments FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE appointments_2025_04 PARTITION OF appointments FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE appointments_2025_05 PARTITION OF appointments FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE appointments_2025_06 PARTITION OF appointments FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE appointments_2025_07 PARTITION OF appointments FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE appointments_2025_08 PARTITION OF appointments FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE appointments_2025_09 PARTITION OF appointments FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE appointments_2025_10 PARTITION OF appointments FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE appointments_2025_11 PARTITION OF appointments FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE appointments_2025_12 PARTITION OF appointments FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
-- Partições mensais 2026 (Jan–Dez)
CREATE TABLE appointments_2026_01 PARTITION OF appointments FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE appointments_2026_02 PARTITION OF appointments FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE appointments_2026_03 PARTITION OF appointments FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE appointments_2026_04 PARTITION OF appointments FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE appointments_2026_05 PARTITION OF appointments FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE appointments_2026_06 PARTITION OF appointments FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE appointments_2026_07 PARTITION OF appointments FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE appointments_2026_08 PARTITION OF appointments FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE appointments_2026_09 PARTITION OF appointments FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE appointments_2026_10 PARTITION OF appointments FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE appointments_2026_11 PARTITION OF appointments FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE appointments_2026_12 PARTITION OF appointments FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- appointments_archive
CREATE TABLE appointments_archive (
  LIKE appointments INCLUDING ALL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- messages — particionada MENSALMENTE por created_at
CREATE TABLE messages (
  id                       UUID NOT NULL DEFAULT uuid_generate_v4(),
  professional_id          UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  contact_id               UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
  meta_message_id          TEXT,      -- sem UNIQUE: particionada por created_at; dedup via query
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
      'responded', 'silent_personal', 'silent_paused',
      'silent_blocked', 'silent_out_of_scope'
    )),
  sent_by                  TEXT NULL CHECK (sent_by IN ('lara', 'professional')),
  read_by_professional_at  TIMESTAMPTZ NULL,
  latency_ms               INT,
  error                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON COLUMN messages.contact_id IS
  'NULL válido: mensagem recebida antes do número ser promovido a contato.';

-- Partições mensais 2025
CREATE TABLE messages_2025_01 PARTITION OF messages FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE messages_2025_02 PARTITION OF messages FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE messages_2025_03 PARTITION OF messages FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE messages_2025_04 PARTITION OF messages FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE messages_2025_05 PARTITION OF messages FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE messages_2025_06 PARTITION OF messages FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE messages_2025_07 PARTITION OF messages FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE messages_2025_08 PARTITION OF messages FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE messages_2025_09 PARTITION OF messages FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE messages_2025_10 PARTITION OF messages FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE messages_2025_11 PARTITION OF messages FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE messages_2025_12 PARTITION OF messages FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
-- Partições mensais 2026
CREATE TABLE messages_2026_01 PARTITION OF messages FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE messages_2026_02 PARTITION OF messages FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE messages_2026_03 PARTITION OF messages FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE messages_2026_04 PARTITION OF messages FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE messages_2026_05 PARTITION OF messages FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE messages_2026_06 PARTITION OF messages FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE messages_2026_07 PARTITION OF messages FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE messages_2026_08 PARTITION OF messages FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE messages_2026_09 PARTITION OF messages FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE messages_2026_10 PARTITION OF messages FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE messages_2026_11 PARTITION OF messages FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE messages_2026_12 PARTITION OF messages FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX idx_messages_professional_contact_created
  ON messages(professional_id, contact_id, created_at);
CREATE INDEX idx_messages_unread
  ON messages(professional_id, read_by_professional_at)
  WHERE read_by_professional_at IS NULL;

-- templates
CREATE TABLE templates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id   UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  name              TEXT NOT NULL
    CHECK (name IN (
      'booking_confirmation', 'reminder_24h', 'reminder_2h',
      'cancellation', 'reschedule_request', 'home_visit_confirmation'
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
  'Trial inicia após 4/6 APPROVED. Política: variante A → B → C se rejected.';

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

-- audit_log — particionada MENSALMENTE
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

-- Partições mensais 2025
CREATE TABLE audit_log_2025_01 PARTITION OF audit_log FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE audit_log_2025_02 PARTITION OF audit_log FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE audit_log_2025_03 PARTITION OF audit_log FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE audit_log_2025_04 PARTITION OF audit_log FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE audit_log_2025_05 PARTITION OF audit_log FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE audit_log_2025_06 PARTITION OF audit_log FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE audit_log_2025_07 PARTITION OF audit_log FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE audit_log_2025_08 PARTITION OF audit_log FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE audit_log_2025_09 PARTITION OF audit_log FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE audit_log_2025_10 PARTITION OF audit_log FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE audit_log_2025_11 PARTITION OF audit_log FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE audit_log_2025_12 PARTITION OF audit_log FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
-- Partições mensais 2026
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_log_2026_03 PARTITION OF audit_log FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_log_2026_06 PARTITION OF audit_log FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_log_2026_07 PARTITION OF audit_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_log_2026_08 PARTITION OF audit_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_log_2026_09 PARTITION OF audit_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_log_2026_10 PARTITION OF audit_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_log_2026_11 PARTITION OF audit_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_log_2026_12 PARTITION OF audit_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- instagram_accounts (stub)
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

-- human_handovers
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
  ON human_handovers(professional_id, status) WHERE status = 'active';

-- webhook_dlq
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

-- nps_feedback
CREATE TABLE nps_feedback (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id       UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  score                 nps_score NOT NULL,
  comment               TEXT,
  day_of_lifecycle      INT,
  responded_to_outreach BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- magic_links
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

-- schedule_blocks — particionada ANUALMENTE (menor volume)
CREATE TABLE schedule_blocks (
  id              UUID DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  title           TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, starts_at)
  -- NOTA: EXCLUDE USING gist não é suportado em tabelas particionadas (PG 17).
) PARTITION BY RANGE (starts_at);

CREATE TABLE schedule_blocks_2025 PARTITION OF schedule_blocks
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE schedule_blocks_2026 PARTITION OF schedule_blocks
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE schedule_blocks_2027 PARTITION OF schedule_blocks
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- proactive_message_rules
CREATE TABLE proactive_message_rules (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                     TEXT UNIQUE NOT NULL,
  trigger_condition        JSONB NOT NULL,
  frequency_limit          INT NOT NULL DEFAULT 1,
  message_template         TEXT NOT NULL,
  link_purpose             TEXT,
  enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_service_modes TEXT[] NOT NULL DEFAULT ARRAY['studio', 'home'],
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- proactive_messages_sent
CREATE TABLE proactive_messages_sent (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  rule_name       TEXT NOT NULL,
  scope           TEXT NOT NULL CHECK (scope IN ('internal', 'external')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proactive_sent_lookup
  ON proactive_messages_sent(professional_id, rule_name, sent_at);

-- professional_notes
CREATE TABLE professional_notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  author          TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- admin_actions_log
CREATE TABLE admin_actions_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     UUID,
  details       JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ops_metrics_hourly
CREATE TABLE ops_metrics_hourly (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hour_bucket     TIMESTAMPTZ NOT NULL,
  metric_name     TEXT NOT NULL,
  metric_value    NUMERIC NOT NULL,
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hour_bucket, metric_name, professional_id)
);

-- legal_documents
CREATE TABLE legal_documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_type     legal_doc_type NOT NULL,
  version      INT NOT NULL,
  content      TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doc_type, version)
);

-- professional_consents
CREATE TABLE professional_consents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id   UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  doc_type          legal_doc_type NOT NULL,
  legal_document_id UUID NOT NULL REFERENCES legal_documents(id),
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professional_id, doc_type, legal_document_id)
);

-- quick_replies
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

-- admin_users
CREATE TABLE admin_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT UNIQUE NOT NULL,
  role         admin_role NOT NULL DEFAULT 'super_admin',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE admin_users IS
  'MVP: apenas super_admin. Outros papéis (support, financial, developer, viewer) pós-MVP.';

-- recovery_tokens
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
    'appointment'::TEXT AS source_type,
    starts_at - (travel_buffer_before_min || ' minutes')::interval AS effective_start,
    ends_at   + (travel_buffer_after_min  || ' minutes')::interval AS effective_end,
    protocol_name AS title
  FROM appointments
  WHERE status NOT IN ('cancelled')

  UNION ALL

  SELECT
    professional_id,
    id          AS source_id,
    'block'::TEXT AS source_type,
    starts_at   AS effective_start,
    ends_at     AS effective_end,
    COALESCE(title, 'Bloqueio') AS title
  FROM schedule_blocks;

CREATE UNIQUE INDEX ON busy_slots(source_id, source_type);
CREATE INDEX idx_busy_slots_range
  ON busy_slots(professional_id, effective_start, effective_end);

COMMENT ON MATERIALIZED VIEW busy_slots IS
  'Atualizada CONCURRENTLY a cada minuto pelo n8n/cron.';

-- -----------------------------------------------------------------------------
-- 1e. Função ensure_partition_exists
-- Cria a partição mensal para a tabela e data informadas caso não exista.
--
-- Três camadas de segurança replicadas do pai para a filha:
--   1) RLS habilitado  → ALTER TABLE partition ENABLE ROW LEVEL SECURITY
--   2) Policies copiadas → via pg_policy (protege acesso direto à partição)
--   3) GRANTs copiados  → via pg_class.relacl + aclexplode()
--
-- RLS e GRANT são INDEPENDENTES:
--   • GRANT controla SE o role pode tocar na tabela (camada de acesso)
--   • RLS  controla QUAIS linhas o role pode ver/modificar (camada de dados)
-- Sem copiar GRANTs, partições filhas ficam inacessíveis para
-- authenticated/service_role mesmo com RLS correto.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_partition_exists(
  p_table_name TEXT,
  p_target_date DATE
) RETURNS TEXT AS $$
DECLARE
  v_partition_name TEXT;
  v_start          DATE;
  v_end            DATE;
  v_policy         RECORD;
  v_roles_str      TEXT;
  v_cmd            TEXT;
  v_grant          RECORD;
  v_grant_sql      TEXT;
BEGIN
  -- Nome: tablename_YYYY_MM
  v_partition_name := p_table_name || '_' || TO_CHAR(p_target_date, 'YYYY_MM');
  v_start          := DATE_TRUNC('month', p_target_date)::DATE;
  v_end            := (DATE_TRUNC('month', p_target_date) + INTERVAL '1 month')::DATE;

  -- Idempotente: retorna imediatamente se já existe
  IF EXISTS (
    SELECT 1 FROM pg_class c
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname = v_partition_name
      AND c.relkind = 'r'
  ) THEN
    RETURN v_partition_name;
  END IF;

  -- Cria a partição
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L::TIMESTAMPTZ) TO (%L::TIMESTAMPTZ)',
    v_partition_name, p_table_name,
    v_start::TEXT, v_end::TEXT
  );

  -- 1) Habilita RLS na partição filha
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_partition_name);

  -- 2) Copia todas as policies do pai para a partição
  --    Necessário para acesso direto à partição (n8n, psql, Supabase Dashboard).
  --    Quando acessado pelo pai, as policies do pai já se aplicam por herança.
  FOR v_policy IN
    SELECT
      pol.polname,
      pol.polcmd,
      pol.polpermissive,
      pg_get_expr(pol.polqual,      pol.polrelid) AS qual,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check,
      ARRAY(
        SELECT rolname FROM pg_roles WHERE oid = ANY(pol.polroles)
      ) AS roles
    FROM pg_policy pol
    INNER JOIN pg_class cls ON cls.oid = pol.polrelid
    INNER JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE cls.relname = p_table_name
      AND ns.nspname  = current_schema()
  LOOP
    -- Determina roles (array vazio → PUBLIC)
    IF array_length(v_policy.roles, 1) IS NULL THEN
      v_roles_str := 'PUBLIC';
    ELSE
      v_roles_str := array_to_string(v_policy.roles, ', ');
    END IF;

    v_cmd := format(
      'CREATE POLICY %I ON %I AS %s FOR %s TO %s',
      v_policy.polname,
      v_partition_name,
      CASE WHEN v_policy.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      CASE v_policy.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        ELSE 'ALL'
      END,
      v_roles_str
    );

    IF v_policy.qual IS NOT NULL THEN
      v_cmd := v_cmd || ' USING (' || v_policy.qual || ')';
    END IF;
    IF v_policy.with_check IS NOT NULL THEN
      v_cmd := v_cmd || ' WITH CHECK (' || v_policy.with_check || ')';
    END IF;

    EXECUTE v_cmd;
  END LOOP;

  -- 3) Copia GRANTs da tabela pai via pg_class.relacl + aclexplode()
  --
  --    Por que é necessário:
  --      GRANT controla SE o role pode acessar a tabela (independente de RLS).
  --      Partições filhas NÃO herdam GRANTs do pai automaticamente no PostgreSQL.
  --      Sem este passo, authenticated e service_role recebem "permission denied"
  --      ao tentar acessar a partição diretamente, mesmo com RLS configurado.
  --
  --    Fonte: pg_class.relacl (array de aclitem). NULL = apenas owner tem acesso.
  --    aclexplode() desempacota em (grantor, grantee, privilege_type, is_grantable).
  --    grantee = 0 (OID) representa PUBLIC.
  FOR v_grant IN
    SELECT
      CASE WHEN acl.grantee = 0
        THEN 'PUBLIC'
        ELSE acl.grantee::regrole::TEXT
      END          AS grantee,
      acl.privilege_type,
      acl.is_grantable
    FROM pg_class c
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace,
    LATERAL aclexplode(c.relacl) AS acl
    WHERE c.relname  = p_table_name
      AND n.nspname  = current_schema()
      AND c.relacl   IS NOT NULL   -- NULL = sem GRANTs explícitos; loop desnecessário
  LOOP
    IF v_grant.grantee = 'PUBLIC' THEN
      v_grant_sql := format(
        'GRANT %s ON TABLE %I TO PUBLIC',
        v_grant.privilege_type, v_partition_name
      );
    ELSE
      v_grant_sql := format(
        'GRANT %s ON TABLE %I TO %I',
        v_grant.privilege_type, v_partition_name, v_grant.grantee
      );
    END IF;

    IF v_grant.is_grantable THEN
      v_grant_sql := v_grant_sql || ' WITH GRANT OPTION';
    END IF;

    EXECUTE v_grant_sql;
  END LOOP;

  RAISE NOTICE '[ensure_partition_exists] Partição criada (RLS + policies + GRANTs replicados): %',
    v_partition_name;
  RETURN v_partition_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION ensure_partition_exists IS
  'Cria partição mensal se não existir e replica do pai:
   (1) ALTER TABLE ... ENABLE ROW LEVEL SECURITY
   (2) Todas as RLS policies via pg_policy
   (3) Todos os GRANTs via pg_class.relacl + aclexplode()
   Chamada pelo trigger BEFORE INSERT em appointments, messages e audit_log.';

-- -----------------------------------------------------------------------------
-- 1f. Trigger BEFORE INSERT — cria partição automaticamente
-- Dispara antes do roteamento Postgres, garantindo que a partição destino exista.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_ensure_partition()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'appointments' THEN v_date := NEW.starts_at::DATE;
    WHEN 'messages'     THEN v_date := COALESCE(NEW.created_at, NOW())::DATE;
    WHEN 'audit_log'    THEN v_date := COALESCE(NEW.created_at, NOW())::DATE;
    ELSE                     v_date := NOW()::DATE;
  END CASE;

  PERFORM ensure_partition_exists(TG_TABLE_NAME, v_date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointments_ensure_partition
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_ensure_partition();

CREATE TRIGGER trg_messages_ensure_partition
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION trigger_ensure_partition();

CREATE TRIGGER trg_audit_log_ensure_partition
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION trigger_ensure_partition();

-- -----------------------------------------------------------------------------
-- 1g. Função is_slot_available (corrigida — inclui outside_working_hours)
-- Reasons: available | outside_working_hours | overlapping_appointment_or_block
--          | contact_address_missing | out_of_service_area
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_slot_available(
  p_professional_id      UUID,
  p_starts_at            TIMESTAMPTZ,
  p_ends_at              TIMESTAMPTZ,
  p_contact_id           UUID DEFAULT NULL,
  p_travel_buffer_before INT  DEFAULT 0,
  p_travel_buffer_after  INT  DEFAULT 0
) RETURNS TABLE (available BOOLEAN, reason TEXT) AS $$
DECLARE
  v_working_hours    JSONB;
  v_service_mode     service_mode;
  v_service_areas    JSONB;
  v_timezone         TEXT;
  v_effective_start  TIMESTAMPTZ;
  v_effective_end    TIMESTAMPTZ;
  v_overlap_count    INT;
  v_day_key          TEXT;
  v_day_hours        JSONB;
  v_work_start       TIME;
  v_work_end         TIME;
  v_slot_start_local TIME;
  v_slot_end_local   TIME;
  v_contact_address  JSONB;
BEGIN
  v_effective_start := p_starts_at - (p_travel_buffer_before || ' minutes')::interval;
  v_effective_end   := p_ends_at   + (p_travel_buffer_after  || ' minutes')::interval;

  SELECT working_hours, service_mode, service_areas, timezone
    INTO v_working_hours, v_service_mode, v_service_areas, v_timezone
  FROM professionals WHERE id = p_professional_id;

  -- ── 1. Verificar horário de trabalho ──────────────────────────────────────
  IF v_working_hours IS NOT NULL THEN
    -- Converte para o fuso da profissional antes de comparar
    v_day_key         := TO_CHAR(p_starts_at AT TIME ZONE v_timezone, 'ID'); -- 1=Seg…7=Dom
    v_day_hours       := v_working_hours->v_day_key;

    -- Dia fechado
    IF v_day_hours IS NULL THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'outside_working_hours'::TEXT;
      RETURN;
    END IF;

    v_work_start      := (v_day_hours->>'start')::TIME;
    v_work_end        := (v_day_hours->>'end')::TIME;
    v_slot_start_local := (p_starts_at AT TIME ZONE v_timezone)::TIME;
    v_slot_end_local   := (p_ends_at   AT TIME ZONE v_timezone)::TIME;

    IF v_slot_start_local < v_work_start OR v_slot_end_local > v_work_end THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'outside_working_hours'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ── 2. Verificar sobreposição com slots ocupados ───────────────────────────
  SELECT COUNT(*) INTO v_overlap_count
  FROM busy_slots
  WHERE professional_id = p_professional_id
    AND tstzrange(effective_start, effective_end, '[)')
        && tstzrange(v_effective_start, v_effective_end, '[)');

  IF v_overlap_count > 0 THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, 'overlapping_appointment_or_block'::TEXT;
    RETURN;
  END IF;

  -- ── 3. Verificar endereço para atendimento em domicílio ───────────────────
  IF v_service_mode = 'home' AND p_contact_id IS NOT NULL THEN
    SELECT address INTO v_contact_address
    FROM contacts WHERE id = p_contact_id;

    IF v_contact_address IS NULL THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'contact_address_missing'::TEXT;
      RETURN;
    END IF;

    IF v_service_areas IS NOT NULL THEN
      IF NOT (v_contact_address ? 'neighborhood') OR
         NOT (v_service_areas  ? (v_contact_address->>'neighborhood')) THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, 'out_of_service_area'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE::BOOLEAN, 'available'::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- 1h. Função should_lara_respond (com lock de typing)
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
  SELECT c.lara_mode, c.is_blocked, c.professional_typing_until, p.is_paused
    INTO v_lara_mode, v_is_blocked, v_typing_until, v_is_paused
  FROM contacts c
  JOIN professionals p ON p.id = c.professional_id
  WHERE c.id = p_contact_id;

  IF v_is_blocked THEN RETURN FALSE; END IF;
  IF v_is_paused  THEN RETURN FALSE; END IF;

  -- Lock: profissional digitando → Lara aguarda
  IF v_typing_until IS NOT NULL AND v_typing_until > NOW() THEN
    RETURN FALSE;
  END IF;

  IF v_lara_mode = 'silent'       THEN RETURN FALSE; END IF;
  IF v_lara_mode = 'full'         THEN RETURN TRUE; END IF;
  IF v_lara_mode = 'booking_only' THEN
    RETURN p_intent IN ('AGENDAR', 'CANCELAR', 'REMARCAR');
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------------------------------
-- 1i. Funções de promoção de contato (política anti-lixo)
-- -----------------------------------------------------------------------------

-- Critérios para criar contato:
--   A. Manual via painel "Quem é?" (fora desta função)
--   B. 2+ mensagens em 24h: 1 existente em orphan_messages + a atual = 2
--   C. Intent de agendamento
CREATE OR REPLACE FUNCTION should_create_contact(
  p_professional_id UUID,
  p_phone_number    TEXT,
  p_current_intent  TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_orphan_count INT;
BEGIN
  -- C: intent de agendamento → cria imediatamente
  IF p_current_intent IN ('AGENDAR', 'CANCELAR', 'REMARCAR') THEN
    RETURN TRUE;
  END IF;

  -- B: já existe ≥1 mensagem órfã em 24h (+ a mensagem atual = 2 total)
  SELECT COUNT(*) INTO v_orphan_count
  FROM orphan_messages
  WHERE professional_id = p_professional_id
    AND phone_number    = p_phone_number
    AND created_at      > NOW() - INTERVAL '24 hours';

  RETURN v_orphan_count >= 1;
END;
$$ LANGUAGE plpgsql;

-- Promove phone_number para contato e migra mensagens órfãs para messages
CREATE OR REPLACE FUNCTION promote_to_contact(
  p_professional_id UUID,
  p_phone_number    TEXT
) RETURNS UUID AS $$
DECLARE
  v_default_mode      default_lara_mode_setting;
  v_initial_lara_mode lara_mode;
  v_contact_id        UUID;
  v_moved_count       INT;
BEGIN
  SELECT default_lara_mode INTO v_default_mode
  FROM professionals WHERE id = p_professional_id;

  v_initial_lara_mode := CASE v_default_mode
    WHEN 'cautious'  THEN 'silent'::lara_mode
    WHEN 'standard'  THEN 'booking_only'::lara_mode
    ELSE 'silent'::lara_mode
  END;

  INSERT INTO contacts (
    professional_id, phone_number, contact_type, lara_mode, last_message_at
  ) VALUES (
    p_professional_id, p_phone_number, 'unknown', v_initial_lara_mode, NOW()
  )
  ON CONFLICT (professional_id, phone_number) DO UPDATE
    SET last_message_at = NOW()
  RETURNING id INTO v_contact_id;

  -- Move mensagens de orphan_messages para messages com contact_id
  WITH moved AS (
    DELETE FROM orphan_messages
    WHERE professional_id = p_professional_id
      AND phone_number    = p_phone_number
    RETURNING
      id, professional_id, meta_message_id, direction, message_type,
      content, media_url, media_type, media_size_bytes, media_caption,
      channel, intent_detected, created_at
  )
  INSERT INTO messages (
    id, professional_id, contact_id, meta_message_id, direction,
    message_type, content, media_url, media_type, media_size_bytes,
    media_caption, channel, intent_detected, created_at
  )
  SELECT
    id, professional_id, v_contact_id, meta_message_id, direction,
    message_type, content, media_url, media_type, media_size_bytes,
    media_caption, channel, intent_detected, created_at
  FROM moved;

  GET DIAGNOSTICS v_moved_count = ROW_COUNT;
  RAISE NOTICE '[promote_to_contact] % mensagens migradas → contact_id=%',
    v_moved_count, v_contact_id;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1j. Função is_within_meta_window (janela 24h Meta)
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
-- 1k. Função detect_message_urgency
-- IMPORTANTE: SQL puro (regex ~*). NÃO chama LLM.
-- Melhoria via LLM ocorre no flow n8n, nunca aqui.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_message_urgency(
  p_content TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_content ~*
    '(urgente|emergência|preciso|tô mal|não tô bem|socorro|me ajuda|aconteceu)';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION detect_message_urgency IS
  'Detecção por regex SQL puro. SEM chamada a LLM. Melhoria via n8n flow separado.';

-- -----------------------------------------------------------------------------
-- 1l. Funções de criptografia
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION encrypt_access_token(p_token TEXT, p_key TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(p_token, p_key, 'cipher-algo=aes256');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_access_token(p_encrypted BYTEA, p_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(p_encrypted, p_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1m. Triggers
-- -----------------------------------------------------------------------------

-- updated_at genérico
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_professionals_updated_at
  BEFORE UPDATE ON professionals FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_quick_replies_updated_at
  BEFORE UPDATE ON quick_replies FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_proactive_rules_updated_at
  BEFORE UPDATE ON proactive_message_rules FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- whatsapp_status_changed_at
CREATE OR REPLACE FUNCTION trigger_whatsapp_status_changed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.whatsapp_status <> OLD.whatsapp_status THEN
    NEW.whatsapp_status_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_whatsapp_status_changed
  BEFORE UPDATE ON professionals FOR EACH ROW
  EXECUTE FUNCTION trigger_whatsapp_status_changed();

-- last_message_at
CREATE OR REPLACE FUNCTION trigger_update_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE contacts SET last_message_at = NEW.created_at WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_messages_last_message_at
  AFTER INSERT ON messages FOR EACH ROW
  EXECUTE FUNCTION trigger_update_last_message_at();

-- last_inbound_message_at (apenas inbound)
CREATE OR REPLACE FUNCTION trigger_update_last_inbound_message_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.contact_id IS NOT NULL THEN
    UPDATE contacts SET last_inbound_message_at = NEW.created_at WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_messages_last_inbound_at
  AFTER INSERT ON messages FOR EACH ROW
  EXECUTE FUNCTION trigger_update_last_inbound_message_at();

-- validate: appointment só aceita contact_type='client'
CREATE OR REPLACE FUNCTION trigger_validate_appointment_contact_type()
RETURNS TRIGGER AS $$
DECLARE
  v_type contact_type;
BEGIN
  SELECT contact_type INTO v_type FROM contacts WHERE id = NEW.contact_id;
  IF v_type <> 'client' THEN
    RAISE EXCEPTION
      'Apenas contatos do tipo "client" podem ter sessões. Contato % é do tipo %.',
      NEW.contact_id, v_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_appointments_validate_contact_type
  BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW
  EXECUTE FUNCTION trigger_validate_appointment_contact_type();

-- preferred_neighborhood
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
  BEFORE INSERT OR UPDATE ON contacts FOR EACH ROW
  EXECUTE FUNCTION trigger_update_preferred_neighborhood();

-- archive: appointments cancelados com >90 dias
CREATE OR REPLACE FUNCTION trigger_archive_old_cancelled_appointments()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND NEW.starts_at < NOW() - INTERVAL '90 days' THEN
    INSERT INTO appointments_archive SELECT NEW.*, NOW();
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_appointments_archive_cancelled
  BEFORE UPDATE ON appointments FOR EACH ROW
  EXECUTE FUNCTION trigger_archive_old_cancelled_appointments();

-- -----------------------------------------------------------------------------
-- 1n. Row Level Security (RLS)
-- Nota: as políticas no pai (tabela particionada) aplicam-se automaticamente
-- ao acesso via pai. ensure_partition_exists() copia as policies para cada
-- partição filha para proteger também acesso direto à partição.
-- -----------------------------------------------------------------------------
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
ALTER TABLE orphan_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;

CREATE POLICY professionals_own_data ON professionals
  FOR ALL USING (auth.uid() = auth_user_id);

CREATE POLICY contacts_own_data ON contacts
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY appointments_own_data ON appointments
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY messages_own_data ON messages
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY orphan_messages_own_data ON orphan_messages
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY audit_log_own_data ON audit_log
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY templates_own_data ON templates
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY subscriptions_own_data ON subscriptions
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY handovers_own_data ON human_handovers
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY quick_replies_own_data ON quick_replies
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY consents_own_data ON professional_consents
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY schedule_blocks_own_data ON schedule_blocks
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY nps_own_data ON nps_feedback
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY magic_links_own_data ON magic_links
  FOR SELECT USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

CREATE POLICY recovery_tokens_own_data ON recovery_tokens
  FOR SELECT USING (
    professional_id IN (SELECT id FROM professionals WHERE auth_user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
COMMENT ON SCHEMA public IS 'Lara — SaaS de agendamentos para esteticistas. v1.1.0';
