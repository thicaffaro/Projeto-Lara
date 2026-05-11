/**
 * /lib/supabase/types.ts
 *
 * Tipos do banco de dados Supabase — gerado-estilo a partir das migrations 0001–0009.
 *
 * Substitui /lib/supabase/types-stub.ts (Prompt E).
 *
 * Para regenerar com dados reais do Supabase Cloud Pro:
 *   npx supabase gen types typescript --project-id <PROJECT_ID> --schema public \
 *     > lib/supabase/types.ts
 *
 * Cobre todas as tabelas, views, funções e enums definidos em:
 *   sql/migrations/0001_initial.sql
 *   sql/migrations/0005_storage_policies.sql
 *   sql/migrations/0006_subscriptions_unique.sql
 *   sql/migrations/0007_fix_working_hours.sql
 *   sql/migrations/0008_dashboard.sql
 *   sql/migrations/0009_dashboard_extras.sql
 */

// ── Tipo base para campos JSONB ──────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ── Helper types para campos JSONB com estrutura conhecida ──────────────────

/** Janela de horário de trabalho (um slot dentro de um dia) */
export interface TimeWindow {
  start: string  // "09:00"
  end: string    // "18:00"
}

/**
 * working_hours: chaves ISO weekday "1"–"7" (1=Seg, 7=Dom).
 * Valor: array de TimeWindow (suporte a múltiplas janelas/dia) OU null (fechado).
 */
export type WorkingHours = Record<string, TimeWindow[] | null>

/** Protocolo de atendimento cadastrado pela profissional */
export interface Protocol {
  name: string
  category: 'facial' | 'corporal' | 'complementar'
  duration_min: number
  price_brl: number
}

/** Configurações de identidade da Lara */
export interface LaraSettings {
  name: string           // ex: "Lara"
  tone: string           // ex: "warm" | "formal" | "casual"
  emojis: boolean
}

// ── Database type principal ──────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {

      // ── admin_actions_log ────────────────────────────────────────────────
      admin_actions_log: {
        Row: {
          id:              string
          admin_user_id:   string | null
          professional_id: string | null   // adicionado em 0009
          action:          string
          target_type:     string | null
          target_id:       string | null
          details:         Json | null
          ip_address:      string | null
          created_at:      string
        }
        Insert: {
          id?:              string
          admin_user_id?:   string | null
          professional_id?: string | null
          action:           string
          target_type?:     string | null
          target_id?:       string | null
          details?:         Json | null
          ip_address?:      string | null
          created_at?:      string
        }
        Update: {
          id?:              string
          admin_user_id?:   string | null
          professional_id?: string | null
          action?:          string
          target_type?:     string | null
          target_id?:       string | null
          details?:         Json | null
          ip_address?:      string | null
          created_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'admin_actions_log_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── admin_users ───────────────────────────────────────────────────────
      admin_users: {
        Row: {
          id:           string
          auth_user_id: string | null
          email:        string
          role:         Database['public']['Enums']['admin_role']
          created_at:   string
          updated_at:   string
        }
        Insert: {
          id?:           string
          auth_user_id?: string | null
          email:         string
          role?:         Database['public']['Enums']['admin_role']
          created_at?:   string
          updated_at?:   string
        }
        Update: {
          id?:           string
          auth_user_id?: string | null
          email?:        string
          role?:         Database['public']['Enums']['admin_role']
          created_at?:   string
          updated_at?:   string
        }
        Relationships: []
      }

      // ── appointments (particionada por starts_at) ────────────────────────
      appointments: {
        Row: {
          id:                       string
          professional_id:           string
          contact_id:               string
          protocol_name:            string
          starts_at:                string
          ends_at:                  string
          status:                   Database['public']['Enums']['appointment_status']
          service_location:         Database['public']['Enums']['service_location']
          travel_buffer_before_min: number
          travel_buffer_after_min:  number
          reminder_24h_sent:        boolean
          reminder_2h_sent:         boolean
          source:                   Database['public']['Enums']['channel_type']
          created_at:               string
          updated_at:               string
        }
        Insert: {
          id?:                       string
          professional_id:           string
          contact_id:               string
          protocol_name:            string
          starts_at:                string
          ends_at:                  string
          status?:                  Database['public']['Enums']['appointment_status']
          service_location?:        Database['public']['Enums']['service_location']
          travel_buffer_before_min?: number
          travel_buffer_after_min?:  number
          reminder_24h_sent?:       boolean
          reminder_2h_sent?:        boolean
          source?:                  Database['public']['Enums']['channel_type']
          created_at?:              string
          updated_at?:              string
        }
        Update: {
          id?:                       string
          professional_id?:          string
          contact_id?:              string
          protocol_name?:           string
          starts_at?:               string
          ends_at?:                 string
          status?:                  Database['public']['Enums']['appointment_status']
          service_location?:        Database['public']['Enums']['service_location']
          travel_buffer_before_min?: number
          travel_buffer_after_min?:  number
          reminder_24h_sent?:       boolean
          reminder_2h_sent?:        boolean
          source?:                  Database['public']['Enums']['channel_type']
          created_at?:              string
          updated_at?:              string
        }
        Relationships: [
          {
            foreignKeyName: 'appointments_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── appointments_archive ──────────────────────────────────────────────
      appointments_archive: {
        Row: {
          id:                       string
          professional_id:           string
          contact_id:               string
          protocol_name:            string
          starts_at:                string
          ends_at:                  string
          status:                   Database['public']['Enums']['appointment_status']
          service_location:         Database['public']['Enums']['service_location']
          travel_buffer_before_min: number
          travel_buffer_after_min:  number
          reminder_24h_sent:        boolean
          reminder_2h_sent:         boolean
          source:                   Database['public']['Enums']['channel_type']
          created_at:               string
          updated_at:               string
          archived_at:              string
        }
        Insert: {
          id?:                       string
          professional_id:           string
          contact_id:               string
          protocol_name:            string
          starts_at:                string
          ends_at:                  string
          status?:                  Database['public']['Enums']['appointment_status']
          service_location?:        Database['public']['Enums']['service_location']
          travel_buffer_before_min?: number
          travel_buffer_after_min?:  number
          reminder_24h_sent?:       boolean
          reminder_2h_sent?:        boolean
          source?:                  Database['public']['Enums']['channel_type']
          created_at?:              string
          updated_at?:              string
          archived_at?:             string
        }
        Update: {
          id?:                       string
          professional_id?:          string
          contact_id?:              string
          protocol_name?:           string
          starts_at?:               string
          ends_at?:                 string
          status?:                  Database['public']['Enums']['appointment_status']
          service_location?:        Database['public']['Enums']['service_location']
          travel_buffer_before_min?: number
          travel_buffer_after_min?:  number
          reminder_24h_sent?:       boolean
          reminder_2h_sent?:        boolean
          source?:                  Database['public']['Enums']['channel_type']
          created_at?:              string
          updated_at?:              string
          archived_at?:             string
        }
        Relationships: []
      }

      // ── audit_log (particionada por created_at) ──────────────────────────
      audit_log: {
        Row: {
          id:                 string
          professional_id:    string | null
          actor:              string
          action:             string
          table_name:         string | null
          record_id:          string | null
          old_data:           Json | null
          new_data:           Json | null
          ip_address:         string | null
          user_agent:         string | null
          /** Decisão da Lara — adicionado em 0011_dashboard_extras.sql */
          lara_mode_decision: string | null
          created_at:         string
        }
        Insert: {
          id?:                 string
          professional_id?:    string | null
          actor:               string
          action:              string
          table_name?:         string | null
          record_id?:          string | null
          old_data?:           Json | null
          new_data?:           Json | null
          ip_address?:         string | null
          user_agent?:         string | null
          lara_mode_decision?: string | null
          created_at?:         string
        }
        Update: {
          id?:                 string
          professional_id?:    string | null
          actor?:              string
          action?:             string
          table_name?:         string | null
          record_id?:          string | null
          old_data?:           Json | null
          new_data?:           Json | null
          ip_address?:         string | null
          user_agent?:         string | null
          lara_mode_decision?: string | null
          created_at?:         string
        }
        Relationships: []
      }

      // ── contacts ──────────────────────────────────────────────────────────
      contacts: {
        Row: {
          id:                         string
          professional_id:            string
          name:                       string | null
          phone_number:               string
          contact_type:               Database['public']['Enums']['contact_type']
          lara_mode:                  Database['public']['Enums']['lara_mode']
          consent_given_at:           string | null
          address:                    Json | null
          preferred_neighborhood:     string | null
          notes:                      string | null
          is_vip:                     boolean
          is_blocked:                 boolean
          pre_registered:             boolean
          last_message_at:            string | null
          last_inbound_message_at:    string | null
          last_notification_at:       string | null
          professional_typing_until:  string | null
          created_at:                 string
          updated_at:                 string
        }
        Insert: {
          id?:                         string
          professional_id:             string
          name?:                       string | null
          phone_number:                string
          contact_type?:               Database['public']['Enums']['contact_type']
          lara_mode?:                  Database['public']['Enums']['lara_mode']
          consent_given_at?:           string | null
          address?:                    Json | null
          preferred_neighborhood?:     string | null
          notes?:                      string | null
          is_vip?:                     boolean
          is_blocked?:                 boolean
          pre_registered?:             boolean
          last_message_at?:            string | null
          last_inbound_message_at?:    string | null
          last_notification_at?:       string | null
          professional_typing_until?:  string | null
          created_at?:                 string
          updated_at?:                 string
        }
        Update: {
          id?:                         string
          professional_id?:            string
          name?:                       string | null
          phone_number?:               string
          contact_type?:               Database['public']['Enums']['contact_type']
          lara_mode?:                  Database['public']['Enums']['lara_mode']
          consent_given_at?:           string | null
          address?:                    Json | null
          preferred_neighborhood?:     string | null
          notes?:                      string | null
          is_vip?:                     boolean
          is_blocked?:                 boolean
          pre_registered?:             boolean
          last_message_at?:            string | null
          last_inbound_message_at?:    string | null
          last_notification_at?:       string | null
          professional_typing_until?:  string | null
          created_at?:                 string
          updated_at?:                 string
        }
        Relationships: [
          {
            foreignKeyName: 'contacts_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── dashboard_sessions (adicionada em 0008) ───────────────────────────
      dashboard_sessions: {
        Row: {
          id:              string
          professional_id: string
          session_token:   string
          device_info:     string | null
          expires_at:      string
          created_at:      string
          last_active_at:  string
        }
        Insert: {
          id?:              string
          professional_id:  string
          session_token:    string
          device_info?:     string | null
          expires_at:       string
          created_at?:      string
          last_active_at?:  string
        }
        Update: {
          id?:              string
          professional_id?: string
          session_token?:   string
          device_info?:     string | null
          expires_at?:      string
          created_at?:      string
          last_active_at?:  string
        }
        Relationships: [
          {
            foreignKeyName: 'dashboard_sessions_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── human_handovers ───────────────────────────────────────────────────
      human_handovers: {
        Row: {
          id:              string
          professional_id: string
          contact_id:      string
          status:          Database['public']['Enums']['handover_status']
          context:         Json | null
          started_at:      string
          resolved_at:     string | null
        }
        Insert: {
          id?:              string
          professional_id:  string
          contact_id:       string
          status?:          Database['public']['Enums']['handover_status']
          context?:         Json | null
          started_at?:      string
          resolved_at?:     string | null
        }
        Update: {
          id?:              string
          professional_id?: string
          contact_id?:      string
          status?:          Database['public']['Enums']['handover_status']
          context?:         Json | null
          started_at?:      string
          resolved_at?:     string | null
        }
        Relationships: [
          {
            foreignKeyName: 'human_handovers_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'human_handovers_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── instagram_accounts (stub, pós-MVP) ───────────────────────────────
      instagram_accounts: {
        Row: {
          id:              string
          professional_id: string
          ig_user_id:      string | null
          ig_page_id:      string | null
          access_token:    string | null
          connected_at:    string | null
          created_at:      string
          updated_at:      string
        }
        Insert: {
          id?:              string
          professional_id:  string
          ig_user_id?:      string | null
          ig_page_id?:      string | null
          access_token?:    string | null
          connected_at?:    string | null
          created_at?:      string
          updated_at?:      string
        }
        Update: {
          id?:              string
          professional_id?: string
          ig_user_id?:      string | null
          ig_page_id?:      string | null
          access_token?:    string | null
          connected_at?:    string | null
          created_at?:      string
          updated_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'instagram_accounts_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── legal_documents ───────────────────────────────────────────────────
      legal_documents: {
        Row: {
          id:           string
          doc_type:     Database['public']['Enums']['legal_doc_type']
          version:      number
          content:      string
          effective_at: string
          created_at:   string
        }
        Insert: {
          id?:          string
          doc_type:     Database['public']['Enums']['legal_doc_type']
          version:      number
          content:      string
          effective_at: string
          created_at?:  string
        }
        Update: {
          id?:          string
          doc_type?:    Database['public']['Enums']['legal_doc_type']
          version?:     number
          content?:     string
          effective_at?: string
          created_at?:  string
        }
        Relationships: []
      }

      // ── magic_links ───────────────────────────────────────────────────────
      magic_links: {
        Row: {
          id:              string
          professional_id: string
          token:           string
          purpose:         string
          expires_at:      string
          used_at:         string | null
          created_at:      string
        }
        Insert: {
          id?:              string
          professional_id:  string
          token:            string
          purpose?:         string
          expires_at:       string
          used_at?:         string | null
          created_at?:      string
        }
        Update: {
          id?:              string
          professional_id?: string
          token?:           string
          purpose?:         string
          expires_at?:      string
          used_at?:         string | null
          created_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'magic_links_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── messages (particionada por created_at) ───────────────────────────
      messages: {
        Row: {
          id:                      string
          professional_id:         string
          contact_id:              string | null
          meta_message_id:         string | null
          direction:               Database['public']['Enums']['message_direction']
          message_type:            Database['public']['Enums']['message_type']
          content:                 string | null
          media_url:               string | null
          media_type:              string | null
          media_size_bytes:        number | null
          media_caption:           string | null
          channel:                 Database['public']['Enums']['channel_type']
          intent_detected:         string | null
          lara_mode_decision:      string | null
          sent_by:                 string | null
          read_by_professional_at: string | null
          latency_ms:              number | null
          error:                   string | null
          created_at:              string
        }
        Insert: {
          id?:                      string
          professional_id:          string
          contact_id?:              string | null
          meta_message_id?:         string | null
          direction:                Database['public']['Enums']['message_direction']
          message_type?:            Database['public']['Enums']['message_type']
          content?:                 string | null
          media_url?:               string | null
          media_type?:              string | null
          media_size_bytes?:        number | null
          media_caption?:           string | null
          channel?:                 Database['public']['Enums']['channel_type']
          intent_detected?:         string | null
          lara_mode_decision?:      string | null
          sent_by?:                 string | null
          read_by_professional_at?: string | null
          latency_ms?:              number | null
          error?:                   string | null
          created_at?:              string
        }
        Update: {
          id?:                      string
          professional_id?:         string
          contact_id?:              string | null
          meta_message_id?:         string | null
          direction?:               Database['public']['Enums']['message_direction']
          message_type?:            Database['public']['Enums']['message_type']
          content?:                 string | null
          media_url?:               string | null
          media_type?:              string | null
          media_size_bytes?:        number | null
          media_caption?:           string | null
          channel?:                 Database['public']['Enums']['channel_type']
          intent_detected?:         string | null
          lara_mode_decision?:      string | null
          sent_by?:                 string | null
          read_by_professional_at?: string | null
          latency_ms?:              number | null
          error?:                   string | null
          created_at?:              string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── nps_feedback ──────────────────────────────────────────────────────
      nps_feedback: {
        Row: {
          id:                     string
          professional_id:        string
          score:                  Database['public']['Enums']['nps_score']
          comment:                string | null
          day_of_lifecycle:       number | null
          responded_to_outreach:  boolean
          created_at:             string
        }
        Insert: {
          id?:                     string
          professional_id:         string
          score:                   Database['public']['Enums']['nps_score']
          comment?:                string | null
          day_of_lifecycle?:       number | null
          responded_to_outreach?:  boolean
          created_at?:             string
        }
        Update: {
          id?:                     string
          professional_id?:        string
          score?:                  Database['public']['Enums']['nps_score']
          comment?:                string | null
          day_of_lifecycle?:       number | null
          responded_to_outreach?:  boolean
          created_at?:             string
        }
        Relationships: [
          {
            foreignKeyName: 'nps_feedback_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── ops_metrics_hourly ────────────────────────────────────────────────
      ops_metrics_hourly: {
        Row: {
          id:              string
          hour_bucket:     string
          metric_name:     string
          metric_value:    number
          professional_id: string | null
          metadata:        Json | null
          created_at:      string
        }
        Insert: {
          id?:              string
          hour_bucket:      string
          metric_name:      string
          metric_value:     number
          professional_id?: string | null
          metadata?:        Json | null
          created_at?:      string
        }
        Update: {
          id?:              string
          hour_bucket?:     string
          metric_name?:     string
          metric_value?:    number
          professional_id?: string | null
          metadata?:        Json | null
          created_at?:      string
        }
        Relationships: []
      }

      // ── orphan_messages ───────────────────────────────────────────────────
      orphan_messages: {
        Row: {
          id:               string
          professional_id:  string
          phone_number:     string
          meta_message_id:  string | null
          direction:        Database['public']['Enums']['message_direction']
          message_type:     Database['public']['Enums']['message_type']
          content:          string | null
          media_url:        string | null
          media_type:       string | null
          media_size_bytes: number | null
          media_caption:    string | null
          channel:          Database['public']['Enums']['channel_type']
          intent_detected:  string | null
          created_at:       string
        }
        Insert: {
          id?:               string
          professional_id:   string
          phone_number:      string
          meta_message_id?:  string | null
          direction?:        Database['public']['Enums']['message_direction']
          message_type?:     Database['public']['Enums']['message_type']
          content?:          string | null
          media_url?:        string | null
          media_type?:       string | null
          media_size_bytes?: number | null
          media_caption?:    string | null
          channel?:          Database['public']['Enums']['channel_type']
          intent_detected?:  string | null
          created_at?:       string
        }
        Update: {
          id?:               string
          professional_id?:  string
          phone_number?:     string
          meta_message_id?:  string | null
          direction?:        Database['public']['Enums']['message_direction']
          message_type?:     Database['public']['Enums']['message_type']
          content?:          string | null
          media_url?:        string | null
          media_type?:       string | null
          media_size_bytes?: number | null
          media_caption?:    string | null
          channel?:          Database['public']['Enums']['channel_type']
          intent_detected?:  string | null
          created_at?:       string
        }
        Relationships: [
          {
            foreignKeyName: 'orphan_messages_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── proactive_message_rules ──────────────────────────────────────────
      proactive_message_rules: {
        Row: {
          id:                       string
          name:                     string
          trigger_condition:        Json
          frequency_limit:          number
          message_template:         string
          link_purpose:             string | null
          enabled:                  boolean
          applicable_service_modes: string[]
          created_at:               string
          updated_at:               string
        }
        Insert: {
          id?:                       string
          name:                      string
          trigger_condition:         Json
          frequency_limit?:          number
          message_template:          string
          link_purpose?:             string | null
          enabled?:                  boolean
          applicable_service_modes?: string[]
          created_at?:               string
          updated_at?:               string
        }
        Update: {
          id?:                       string
          name?:                     string
          trigger_condition?:        Json
          frequency_limit?:          number
          message_template?:         string
          link_purpose?:             string | null
          enabled?:                  boolean
          applicable_service_modes?: string[]
          created_at?:               string
          updated_at?:               string
        }
        Relationships: []
      }

      // ── proactive_messages_sent ──────────────────────────────────────────
      proactive_messages_sent: {
        Row: {
          id:              string
          professional_id: string
          contact_id:      string | null
          rule_name:       string
          scope:           string
          sent_at:         string
        }
        Insert: {
          id?:              string
          professional_id:  string
          contact_id?:      string | null
          rule_name:        string
          scope:            string
          sent_at?:         string
        }
        Update: {
          id?:              string
          professional_id?: string
          contact_id?:      string | null
          rule_name?:       string
          scope?:           string
          sent_at?:         string
        }
        Relationships: [
          {
            foreignKeyName: 'proactive_messages_sent_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'proactive_messages_sent_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
        ]
      }

      // ── professional_consents ─────────────────────────────────────────────
      professional_consents: {
        Row: {
          id:                string
          professional_id:   string
          doc_type:          Database['public']['Enums']['legal_doc_type']
          legal_document_id: string
          accepted_at:       string
        }
        Insert: {
          id?:                string
          professional_id:    string
          doc_type:           Database['public']['Enums']['legal_doc_type']
          legal_document_id:  string
          accepted_at?:       string
        }
        Update: {
          id?:                string
          professional_id?:   string
          doc_type?:          Database['public']['Enums']['legal_doc_type']
          legal_document_id?: string
          accepted_at?:       string
        }
        Relationships: [
          {
            foreignKeyName: 'professional_consents_legal_document_id_fkey'
            columns: ['legal_document_id']
            isOneToOne: false
            referencedRelation: 'legal_documents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'professional_consents_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── professional_notes ────────────────────────────────────────────────
      professional_notes: {
        Row: {
          id:              string
          professional_id: string
          author:          string
          content:         string
          created_at:      string
        }
        Insert: {
          id?:              string
          professional_id:  string
          author:           string
          content:          string
          created_at?:      string
        }
        Update: {
          id?:              string
          professional_id?: string
          author?:          string
          content?:         string
          created_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'professional_notes_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── professionals ─────────────────────────────────────────────────────
      professionals: {
        Row: {
          id:                         string
          auth_user_id:               string | null
          name:                       string
          phone_number:               string
          recovery_email:             string | null
          cpf_or_cnpj:                string | null
          timezone:                   string
          whatsapp_status:            Database['public']['Enums']['whatsapp_status']
          whatsapp_status_changed_at: string | null
          /** BYTEA retornado como string base64 pela API Supabase */
          access_token_encrypted:     string | null
          meta_waba_id:               string | null
          meta_phone_number_id:       string | null
          /** Chaves ISO "1"–"7". Ver WorkingHours helper type. */
          working_hours:              Json | null
          /** Array de Protocol. Ver Protocol helper type. */
          protocols:                  Json | null
          specialty:                  Database['public']['Enums']['specialty']
          service_mode:               Database['public']['Enums']['service_mode']
          studio_address:             Json | null
          home_service_radius_km:     number | null
          home_service_buffer_min:    number
          service_areas:              Json | null
          default_lara_mode:          Database['public']['Enums']['default_lara_mode_setting']
          trial_started_at:           string | null
          trial_ends_at:              string | null
          trial_extension_days:       number
          onboarding_completed:       boolean
          is_paused:                  boolean
          silent_hours:               Json | null
          acquisition_source:         string | null
          dashboard_pin_hash:         string | null
          billing_paused_at:          string | null
          created_at:                 string
          updated_at:                 string
          /** PIN hash bcrypt (cost 12). Adicionado em 0008. */
          pin_hash:                   string | null
          /** Tentativas erradas de PIN. Adicionado em 0008. */
          pin_attempts:               number
          /** Lock de PIN até esta data/hora. Adicionado em 0008. */
          pin_locked_until:           string | null
          /** Configurações de identidade da Lara. Adicionado em 0009. */
          lara_settings:              Json | null
        }
        Insert: {
          id?:                         string
          auth_user_id?:               string | null
          name:                        string
          phone_number:                string
          recovery_email?:             string | null
          cpf_or_cnpj?:                string | null
          timezone?:                   string
          whatsapp_status?:            Database['public']['Enums']['whatsapp_status']
          whatsapp_status_changed_at?: string | null
          access_token_encrypted?:     string | null
          meta_waba_id?:               string | null
          meta_phone_number_id?:       string | null
          working_hours?:              Json | null
          protocols?:                  Json | null
          specialty?:                  Database['public']['Enums']['specialty']
          service_mode?:               Database['public']['Enums']['service_mode']
          studio_address?:             Json | null
          home_service_radius_km?:     number | null
          home_service_buffer_min?:    number
          service_areas?:              Json | null
          default_lara_mode?:          Database['public']['Enums']['default_lara_mode_setting']
          trial_started_at?:           string | null
          trial_ends_at?:              string | null
          trial_extension_days?:       number
          onboarding_completed?:       boolean
          is_paused?:                  boolean
          silent_hours?:               Json | null
          acquisition_source?:         string | null
          dashboard_pin_hash?:         string | null
          billing_paused_at?:          string | null
          created_at?:                 string
          updated_at?:                 string
          pin_hash?:                   string | null
          pin_attempts?:               number
          pin_locked_until?:           string | null
          lara_settings?:              Json | null
        }
        Update: {
          id?:                         string
          auth_user_id?:               string | null
          name?:                       string
          phone_number?:               string
          recovery_email?:             string | null
          cpf_or_cnpj?:                string | null
          timezone?:                   string
          whatsapp_status?:            Database['public']['Enums']['whatsapp_status']
          whatsapp_status_changed_at?: string | null
          access_token_encrypted?:     string | null
          meta_waba_id?:               string | null
          meta_phone_number_id?:       string | null
          working_hours?:              Json | null
          protocols?:                  Json | null
          specialty?:                  Database['public']['Enums']['specialty']
          service_mode?:               Database['public']['Enums']['service_mode']
          studio_address?:             Json | null
          home_service_radius_km?:     number | null
          home_service_buffer_min?:    number
          service_areas?:              Json | null
          default_lara_mode?:          Database['public']['Enums']['default_lara_mode_setting']
          trial_started_at?:           string | null
          trial_ends_at?:              string | null
          trial_extension_days?:       number
          onboarding_completed?:       boolean
          is_paused?:                  boolean
          silent_hours?:               Json | null
          acquisition_source?:         string | null
          dashboard_pin_hash?:         string | null
          billing_paused_at?:          string | null
          created_at?:                 string
          updated_at?:                 string
          pin_hash?:                   string | null
          pin_attempts?:               number
          pin_locked_until?:           string | null
          lara_settings?:              Json | null
        }
        Relationships: []
      }

      // ── quick_replies ─────────────────────────────────────────────────────
      quick_replies: {
        Row: {
          id:              string
          professional_id: string
          shortcut:        string
          full_text:       string
          order_index:     number
          created_at:      string
          updated_at:      string
        }
        Insert: {
          id?:              string
          professional_id:  string
          shortcut:         string
          full_text:        string
          order_index?:     number
          created_at?:      string
          updated_at?:      string
        }
        Update: {
          id?:              string
          professional_id?: string
          shortcut?:        string
          full_text?:       string
          order_index?:     number
          created_at?:      string
          updated_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'quick_replies_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── recovery_tokens ───────────────────────────────────────────────────
      recovery_tokens: {
        Row: {
          id:              string
          professional_id: string
          channel:         string
          token:           string
          destination:     string
          purpose:         string
          expires_at:      string
          used_at:         string | null
          created_at:      string
        }
        Insert: {
          id?:              string
          professional_id:  string
          channel:          string
          token:            string
          destination:      string
          purpose:          string
          expires_at:       string
          used_at?:         string | null
          created_at?:      string
        }
        Update: {
          id?:              string
          professional_id?: string
          channel?:         string
          token?:           string
          destination?:     string
          purpose?:         string
          expires_at?:      string
          used_at?:         string | null
          created_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'recovery_tokens_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── schedule_blocks (particionada por starts_at) ─────────────────────
      schedule_blocks: {
        Row: {
          id:              string
          professional_id: string
          title:           string | null
          starts_at:       string
          ends_at:         string
          created_at:      string
        }
        Insert: {
          id?:              string
          professional_id:  string
          title?:           string | null
          starts_at:        string
          ends_at:          string
          created_at?:      string
        }
        Update: {
          id?:              string
          professional_id?: string
          title?:           string | null
          starts_at?:       string
          ends_at?:         string
          created_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: 'schedule_blocks_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── subscriptions ─────────────────────────────────────────────────────
      subscriptions: {
        Row: {
          id:                 string
          professional_id:    string
          status:             Database['public']['Enums']['subscription_status']
          mp_subscription_id: string | null
          mp_paused_at:       string | null
          /** Adicionado em 0006. */
          cancelled_at:       string | null
          created_at:         string
          updated_at:         string
        }
        Insert: {
          id?:                 string
          professional_id:     string
          status?:             Database['public']['Enums']['subscription_status']
          mp_subscription_id?: string | null
          mp_paused_at?:       string | null
          cancelled_at?:       string | null
          created_at?:         string
          updated_at?:         string
        }
        Update: {
          id?:                 string
          professional_id?:    string
          status?:             Database['public']['Enums']['subscription_status']
          mp_subscription_id?: string | null
          mp_paused_at?:       string | null
          cancelled_at?:       string | null
          created_at?:         string
          updated_at?:         string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── templates ─────────────────────────────────────────────────────────
      templates: {
        Row: {
          id:               string
          professional_id:  string
          name:             string
          variant:          Database['public']['Enums']['template_variant']
          status:           Database['public']['Enums']['template_status']
          meta_template_id: string | null
          submitted_at:     string | null
          approved_at:      string | null
          rejection_reason: string | null
          created_at:       string
          updated_at:       string
        }
        Insert: {
          id?:               string
          professional_id:   string
          name:              string
          variant?:          Database['public']['Enums']['template_variant']
          status?:           Database['public']['Enums']['template_status']
          meta_template_id?: string | null
          submitted_at?:     string | null
          approved_at?:      string | null
          rejection_reason?: string | null
          created_at?:       string
          updated_at?:       string
        }
        Update: {
          id?:               string
          professional_id?:  string
          name?:             string
          variant?:          Database['public']['Enums']['template_variant']
          status?:           Database['public']['Enums']['template_status']
          meta_template_id?: string | null
          submitted_at?:     string | null
          approved_at?:      string | null
          rejection_reason?: string | null
          created_at?:       string
          updated_at?:       string
        }
        Relationships: [
          {
            foreignKeyName: 'templates_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

      // ── webhook_dlq ───────────────────────────────────────────────────────
      webhook_dlq: {
        Row: {
          id:           string
          source:       string
          payload:      Json
          error:        string | null
          attempts:     number
          last_attempt: string | null
          resolved_at:  string | null
          created_at:   string
        }
        Insert: {
          id?:           string
          source:        string
          payload:       Json
          error?:        string | null
          attempts?:     number
          last_attempt?: string | null
          resolved_at?:  string | null
          created_at?:   string
        }
        Update: {
          id?:           string
          source?:       string
          payload?:      Json
          error?:        string | null
          attempts?:     number
          last_attempt?: string | null
          resolved_at?:  string | null
          created_at?:   string
        }
        Relationships: []
      }

    }

    // ── Views ────────────────────────────────────────────────────────────────
    Views: {

      /**
       * busy_slots — VIEW MATERIALIZADA
       * Unifica appointments (não cancelados) + schedule_blocks.
       * Atualizada CONCURRENTLY a cada minuto pelo n8n/cron.
       */
      busy_slots: {
        Row: {
          professional_id: string | null
          source_id:       string | null
          source_type:     string | null  // 'appointment' | 'block'
          effective_start: string | null
          effective_end:   string | null
          title:           string | null
        }
        Relationships: [
          {
            foreignKeyName: 'appointments_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }

    }

    // ── Functions ─────────────────────────────────────────────────────────────
    Functions: {

      detect_message_urgency: {
        Args:    { p_content: string }
        Returns: boolean
      }

      ensure_partition_exists: {
        Args:    { p_table_name: string; p_target_date: string }
        Returns: string
      }

      is_slot_available: {
        Args: {
          p_professional_id:      string
          p_starts_at:            string
          p_ends_at:              string
          p_contact_id?:          string
          p_travel_buffer_before?: number
          p_travel_buffer_after?:  number
        }
        Returns: Array<{ available: boolean; reason: string }>
      }

      is_within_meta_window: {
        Args:    { p_contact_id: string }
        Returns: boolean
      }

      promote_to_contact: {
        Args:    { p_professional_id: string; p_phone_number: string }
        Returns: string
      }

      should_create_contact: {
        Args: {
          p_professional_id: string
          p_phone_number:    string
          p_current_intent:  string
        }
        Returns: boolean
      }

      should_lara_respond: {
        Args:    { p_contact_id: string; p_intent: string }
        Returns: boolean
      }

      /** Criptografa token via pgp_sym_encrypt (AES-256). Retorna BYTEA como string hex. */
      encrypt_access_token: {
        Args:    { p_token: string; p_key: string }
        Returns: string
      }

      /** Decriptografa BYTEA via pgp_sym_decrypt. Retorna TEXT ou null em caso de falha. */
      decrypt_access_token: {
        Args:    { p_encrypted: string; p_key: string }
        Returns: string | null
      }

    }

    // ── Enums ─────────────────────────────────────────────────────────────────
    Enums: {
      admin_role:
        | 'super_admin'
        | 'support'
        | 'financial'
        | 'developer'
        | 'viewer'

      appointment_status:
        | 'confirmed'
        | 'cancelled'
        | 'rescheduled'
        | 'no_show'
        | 'pending'

      channel_type:
        | 'whatsapp'
        | 'instagram'

      contact_type:
        | 'client'
        | 'personal'
        | 'business'
        | 'unknown'

      default_lara_mode_setting:
        | 'cautious'
        | 'standard'

      handover_status:
        | 'active'
        | 'resolved'

      lara_mode:
        | 'full'
        | 'booking_only'
        | 'silent'

      legal_doc_type:
        | 'privacy_policy'
        | 'terms_of_use'

      message_direction:
        | 'inbound'
        | 'outbound'

      message_type:
        | 'text'
        | 'image'
        | 'audio'
        | 'video'
        | 'document'
        | 'sticker'

      nps_score:
        | 'happy'
        | 'neutral'
        | 'sad'

      service_location:
        | 'studio'
        | 'client_home'

      service_mode:
        | 'studio'
        | 'home'

      specialty:
        | 'facial'
        | 'corporal'
        | 'both'

      subscription_status:
        | 'trial'
        | 'trial_pending_templates'
        | 'active'
        | 'past_due'
        | 'cancelled'
        | 'cancelled_pending_anonymization'

      template_status:
        | 'pending'
        | 'approved'
        | 'rejected'
        | 'paused'

      template_variant:
        | 'a'
        | 'b'
        | 'c'

      whatsapp_status:
        | 'connected'
        | 'token_invalid'
        | 'disconnected'
    }

    CompositeTypes: Record<string, never>
  }
}

// ── Helpers de Row (compat com imports legados de types-stub.ts) ─────────────

export type ProfessionalRow  = Database['public']['Tables']['professionals']['Row']
export type ContactRow       = Database['public']['Tables']['contacts']['Row']
export type TemplateRow      = Database['public']['Tables']['templates']['Row']
export type SubscriptionRow  = Database['public']['Tables']['subscriptions']['Row']
export type MessageRow       = Database['public']['Tables']['messages']['Row']
export type AppointmentRow   = Database['public']['Tables']['appointments']['Row']
export type ScheduleBlockRow = Database['public']['Tables']['schedule_blocks']['Row']
export type MagicLinkRow     = Database['public']['Tables']['magic_links']['Row']
export type DashboardSessionRow    = Database['public']['Tables']['dashboard_sessions']['Row']
export type HumanHandoverRow       = Database['public']['Tables']['human_handovers']['Row']
export type OrphanMessageRow       = Database['public']['Tables']['orphan_messages']['Row']
export type WebhookDlqRow          = Database['public']['Tables']['webhook_dlq']['Row']
export type LegalDocumentRow       = Database['public']['Tables']['legal_documents']['Row']
export type ProfessionalConsentRow = Database['public']['Tables']['professional_consents']['Row']
export type AdminUserRow           = Database['public']['Tables']['admin_users']['Row']
export type AdminActionsLogRow     = Database['public']['Tables']['admin_actions_log']['Row']
export type RecoveryTokenRow       = Database['public']['Tables']['recovery_tokens']['Row']
export type AuditLogRow            = Database['public']['Tables']['audit_log']['Row']
export type NpsFeedbackRow         = Database['public']['Tables']['nps_feedback']['Row']
export type QuickReplyRow          = Database['public']['Tables']['quick_replies']['Row']
export type BusySlotsRow           = Database['public']['Views']['busy_slots']['Row']

// ── Enum helpers ──────────────────────────────────────────────────────────────

export type AppointmentStatus     = Database['public']['Enums']['appointment_status']
export type ContactType           = Database['public']['Enums']['contact_type']
export type LaraMode              = Database['public']['Enums']['lara_mode']
export type DefaultLaraModeSetting = Database['public']['Enums']['default_lara_mode_setting']
export type TemplateStatus        = Database['public']['Enums']['template_status']
export type TemplateVariant       = Database['public']['Enums']['template_variant']
export type MessageDirection      = Database['public']['Enums']['message_direction']
export type MessageType           = Database['public']['Enums']['message_type']
export type HandoverStatus        = Database['public']['Enums']['handover_status']
export type SubscriptionStatus    = Database['public']['Enums']['subscription_status']
export type WhatsappStatus        = Database['public']['Enums']['whatsapp_status']
export type ChannelType           = Database['public']['Enums']['channel_type']
export type ServiceMode           = Database['public']['Enums']['service_mode']
export type Specialty             = Database['public']['Enums']['specialty']
export type ServiceLocation       = Database['public']['Enums']['service_location']
export type AdminRole             = Database['public']['Enums']['admin_role']
export type LegalDocType          = Database['public']['Enums']['legal_doc_type']
export type NpsScore              = Database['public']['Enums']['nps_score']
