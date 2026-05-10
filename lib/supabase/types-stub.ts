/**
 * /lib/supabase/types-stub.ts
 *
 * ⚠️  ARQUIVO TEMPORÁRIO — será substituído no Prompt E por:
 *   supabase gen types typescript --project-id <PROJECT_ID> > lib/supabase/types.ts
 *
 * Contém apenas as interfaces usadas atualmente no código.
 * Campos marcados com `unknown` serão tipados corretamente após geração automática.
 */

// ── Tabela professionals ──────────────────────────────────────────────────────

export interface ProfessionalRow {
  id: string
  auth_user_id: string | null
  name: string
  phone_number: string
  recovery_email: string | null
  cpf_or_cnpj: string | null
  timezone: string
  whatsapp_status: 'connected' | 'token_invalid' | 'disconnected'
  whatsapp_status_changed_at: string | null
  access_token_encrypted: unknown | null
  meta_waba_id: string | null
  meta_phone_number_id: string | null
  working_hours: Record<string, Array<{ start: string; end: string }> | null> | null
  protocols: Array<{
    name: string
    category: 'facial' | 'corporal' | 'complementar'
    duration_min: number
    price_brl: number
  }> | null
  specialty: 'facial' | 'corporal' | 'both'
  service_mode: 'studio' | 'home'
  studio_address: Record<string, unknown> | null
  home_service_radius_km: number | null
  home_service_buffer_min: number
  service_areas: Record<string, string[]> | null
  default_lara_mode: 'cautious' | 'standard'
  trial_started_at: string | null
  trial_ends_at: string | null
  trial_extension_days: number
  onboarding_completed: boolean
  is_paused: boolean
  silent_hours: unknown | null
  acquisition_source: string | null
  dashboard_pin_hash: string | null
  billing_paused_at: string | null
  created_at: string
  updated_at: string
}

// ── Tabela contacts ───────────────────────────────────────────────────────────

export interface ContactRow {
  id: string
  professional_id: string
  name: string | null
  phone_number: string
  contact_type: 'client' | 'personal' | 'business' | 'unknown'
  lara_mode: 'full' | 'booking_only' | 'silent'
  consent_given_at: string | null
  address: Record<string, unknown> | null
  preferred_neighborhood: string | null
  notes: string | null
  is_vip: boolean
  is_blocked: boolean
  pre_registered: boolean
  last_message_at: string | null
  last_inbound_message_at: string | null
  last_notification_at: string | null
  professional_typing_until: string | null
  created_at: string
  updated_at: string
}

// ── Tabela templates ──────────────────────────────────────────────────────────

export interface TemplateRow {
  id: string
  professional_id: string
  name: 'booking_confirmation' | 'reminder_24h' | 'reminder_2h' | 'cancellation' | 'reschedule_request' | 'home_visit_confirmation'
  variant: 'a' | 'b' | 'c'
  status: 'pending' | 'approved' | 'rejected' | 'paused'
  meta_template_id: string | null
  submitted_at: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

// ── Tabela subscriptions ──────────────────────────────────────────────────────

export interface SubscriptionRow {
  id: string
  professional_id: string
  status: 'trial' | 'trial_pending_templates' | 'active' | 'past_due' | 'cancelled' | 'cancelled_pending_anonymization'
  mp_subscription_id: string | null
  mp_paused_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

// ── Database shape para createClient<Database>() ──────────────────────────────

export interface Database {
  public: {
    Tables: {
      professionals: {
        Row:    ProfessionalRow
        Insert: Partial<ProfessionalRow>
        Update: Partial<ProfessionalRow>
      }
      contacts: {
        Row:    ContactRow
        Insert: Partial<ContactRow>
        Update: Partial<ContactRow>
      }
      templates: {
        Row:    TemplateRow
        Insert: Partial<TemplateRow>
        Update: Partial<TemplateRow>
      }
      subscriptions: {
        Row:    SubscriptionRow
        Insert: Partial<SubscriptionRow>
        Update: Partial<SubscriptionRow>
      }
      // Tabelas restantes tipadas como genéricas até `supabase gen types typescript`
      // Adicionar aqui conforme necessário ao longo do desenvolvimento.
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
