-- =============================================================================
-- 0003_seed_proactive_rules.sql
-- Lara — 8 regras de mensagens proativas automáticas
-- =============================================================================

INSERT INTO proactive_message_rules (
  name,
  trigger_condition,
  frequency_limit,
  message_template,
  link_purpose,
  enabled,
  applicable_service_modes
) VALUES

-- 1. Bom dia / lembrete matinal de agenda do dia
(
  'good_morning',
  '{
    "type": "cron",
    "cron": "0 8 * * *",
    "condition": "has_appointments_today"
  }'::jsonb,
  1,
  'Bom dia! 🌅 Você tem {{appointment_count}} sessão(ões) hoje. Primeira às {{first_appointment_time}} com {{first_client_name}}. Boa sorte! 💆‍♀️',
  'daily_summary',
  TRUE,
  ARRAY['studio', 'home']
),

-- 2. Slot liberado após cancelamento (para lista de espera futura)
(
  'cancellation_opens_slot',
  '{
    "type": "event",
    "event": "appointment.cancelled",
    "delay_minutes": 0
  }'::jsonb,
  1,
  'Olá {{professional_name}}! A sessão de {{cancelled_client_name}} às {{cancelled_time}} foi cancelada. O horário está livre para reagendamento.',
  'slot_notification',
  TRUE,
  ARRAY['studio', 'home']
),

-- 3. Resumo semanal de atendimentos (toda sexta às 18h)
(
  'weekly_summary',
  '{
    "type": "cron",
    "cron": "0 18 * * 5",
    "condition": "always"
  }'::jsonb,
  1,
  'Resumo da semana: {{sessions_count}} sessões realizadas, {{cancellations_count}} cancelamentos, {{new_clients_count}} novas clientes. Tenha um ótimo fim de semana! 🌸',
  'weekly_report',
  TRUE,
  ARRAY['studio', 'home']
),

-- 4. No-show detectado (cliente não compareceu)
(
  'no_show_detected',
  '{
    "type": "event",
    "event": "appointment.no_show",
    "delay_minutes": 15
  }'::jsonb,
  1,
  'Lara aqui: parece que {{client_name}} não compareceu à sessão de {{protocol_name}} às {{appointment_time}}. Deseja que eu entre em contato com ela?',
  'no_show_followup',
  TRUE,
  ARRAY['studio', 'home']
),

-- 5. Lembrete de trial expirando (dia 5 dos 7 dias)
(
  'trial_day_5',
  '{
    "type": "lifecycle",
    "days_after_trial_start": 5,
    "condition": "trial_active"
  }'::jsonb,
  1,
  'Olá {{professional_name}}! Seu período de avaliação da Lara termina em 2 dias. Continue automatizando seus agendamentos por apenas R$ 99/mês. Acesse {{dashboard_url}} para assinar.',
  'trial_conversion',
  TRUE,
  ARRAY['studio', 'home']
),

-- 6. Primeira sessão agendada por nova cliente
(
  'new_client_booked',
  '{
    "type": "event",
    "event": "appointment.created",
    "condition": "first_appointment_for_contact"
  }'::jsonb,
  1,
  '✨ Nova cliente! {{client_name}} agendou {{protocol_name}} para {{appointment_datetime}}. A Lara já enviou a confirmação para ela.',
  'new_client_notification',
  TRUE,
  ARRAY['studio', 'home']
),

-- 7. Otimizador de rota (apenas para atendimento em domicílio)
(
  'route_optimizer',
  '{
    "type": "cron",
    "cron": "0 7 * * *",
    "condition": "has_home_appointments_today"
  }'::jsonb,
  1,
  'Rota de hoje: {{route_summary}}. Ordem sugerida por proximidade: {{route_order}}. Tempo total estimado de deslocamento: {{total_travel_time}} min.',
  'route_planning',
  TRUE,
  ARRAY['home']
),

-- 8. Verificação de templates pendentes há >24h (garante que trial possa iniciar)
(
  'templates_pending_check',
  '{
    "type": "cron",
    "cron": "0 */6 * * *",
    "condition": "has_templates_pending_over_24h"
  }'::jsonb,
  1,
  'Lara aqui: {{pending_count}} template(s) ainda estão aguardando aprovação da Meta há mais de 24h. Isso pode atrasar o início do seu trial. Acesse {{dashboard_url}}/lara para verificar.',
  'template_status_check',
  TRUE,
  ARRAY['studio', 'home']
)

ON CONFLICT (name) DO UPDATE SET
  trigger_condition      = EXCLUDED.trigger_condition,
  frequency_limit        = EXCLUDED.frequency_limit,
  message_template       = EXCLUDED.message_template,
  link_purpose           = EXCLUDED.link_purpose,
  enabled                = EXCLUDED.enabled,
  applicable_service_modes = EXCLUDED.applicable_service_modes,
  updated_at             = NOW();
