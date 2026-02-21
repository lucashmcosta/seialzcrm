export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          body: string | null
          contact_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          id: string
          is_sample: boolean | null
          occurred_at: string | null
          opportunity_id: string | null
          organization_id: string
          title: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          body?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_sample?: boolean | null
          occurred_at?: string | null
          opportunity_id?: string | null
          organization_id: string
          title: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          body?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_sample?: boolean | null
          occurred_at?: string | null
          opportunity_id?: string | null
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_integrations: {
        Row: {
          category: string
          config_schema: Json | null
          created_at: string | null
          description: string | null
          documentation_url: string | null
          id: string
          logo_url: string | null
          master_config: Json | null
          name: string
          slug: string
          sort_order: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          documentation_url?: string | null
          id?: string
          logo_url?: string | null
          master_config?: Json | null
          name: string
          slug: string
          sort_order?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          documentation_url?: string | null
          id?: string
          logo_url?: string | null
          master_config?: Json | null
          name?: string
          slug?: string
          sort_order?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          admin_user_id: string | null
          body: string | null
          created_at: string | null
          id: string
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          admin_user_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          admin_user_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_sessions: {
        Row: {
          admin_user_id: string
          created_at: string | null
          expires_at: string
          id: string
          ip_address: string | null
          mfa_verified: boolean | null
          revoked_at: string | null
          session_token: string
          user_agent: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          mfa_verified?: boolean | null
          revoked_at?: string | null
          session_token: string
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          mfa_verified?: boolean | null
          revoked_at?: string | null
          session_token?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_sessions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          auth_user_id: string
          created_at: string | null
          email: string
          failed_login_attempts: number | null
          full_name: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          last_login_ip: string | null
          locked_until: string | null
          mfa_backup_codes: string[] | null
          mfa_enabled: boolean
          mfa_secret: string | null
          mfa_setup_completed_at: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string | null
          email: string
          failed_login_attempts?: number | null
          full_name: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_login_ip?: string | null
          locked_until?: string | null
          mfa_backup_codes?: string[] | null
          mfa_enabled?: boolean
          mfa_secret?: string | null
          mfa_setup_completed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string | null
          email?: string
          failed_login_attempts?: number | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_login_ip?: string | null
          locked_until?: string | null
          mfa_backup_codes?: string[] | null
          mfa_enabled?: boolean
          mfa_secret?: string | null
          mfa_setup_completed_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_pending_questions: {
        Row: {
          agent_id: string
          answer: string | null
          answered_at: string | null
          created_at: string | null
          id: string
          organization_id: string
          question: string
          slot: string | null
          source_feedback: string | null
          status: string | null
        }
        Insert: {
          agent_id: string
          answer?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          organization_id: string
          question: string
          slot?: string | null
          source_feedback?: string | null
          status?: string | null
        }
        Update: {
          agent_id?: string
          answer?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string
          question?: string
          slot?: string | null
          source_feedback?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_pending_questions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pending_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_logs: {
        Row: {
          agent_id: string
          contact_id: string | null
          context_used: Json | null
          created_at: string | null
          error_message: string | null
          id: string
          input_message: string
          model_used: string | null
          organization_id: string
          output_message: string
          response_time_ms: number | null
          status: string | null
          thread_id: string | null
          tokens_used: number | null
        }
        Insert: {
          agent_id: string
          contact_id?: string | null
          context_used?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_message: string
          model_used?: string | null
          organization_id: string
          output_message: string
          response_time_ms?: number | null
          status?: string | null
          thread_id?: string | null
          tokens_used?: number | null
        }
        Update: {
          agent_id?: string
          contact_id?: string | null
          context_used?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_message?: string
          model_used?: string | null
          organization_id?: string
          output_message?: string
          response_time_ms?: number | null
          status?: string | null
          thread_id?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_logs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_versions: {
        Row: {
          agent_id: string
          ai_model: string | null
          ai_provider: string | null
          change_note: string | null
          compliance_rules: Json | null
          created_at: string | null
          created_by: string | null
          enabled_tools: Json | null
          feedback_rules: Json | null
          id: string
          is_rollback: boolean | null
          kernel_prompt: string | null
          rollback_from_version: number | null
          tool_triggers: Json | null
          version_number: number
          wizard_data: Json | null
        }
        Insert: {
          agent_id: string
          ai_model?: string | null
          ai_provider?: string | null
          change_note?: string | null
          compliance_rules?: Json | null
          created_at?: string | null
          created_by?: string | null
          enabled_tools?: Json | null
          feedback_rules?: Json | null
          id?: string
          is_rollback?: boolean | null
          kernel_prompt?: string | null
          rollback_from_version?: number | null
          tool_triggers?: Json | null
          version_number: number
          wizard_data?: Json | null
        }
        Update: {
          agent_id?: string
          ai_model?: string | null
          ai_provider?: string | null
          change_note?: string | null
          compliance_rules?: Json | null
          created_at?: string | null
          created_by?: string | null
          enabled_tools?: Json | null
          feedback_rules?: Json | null
          id?: string
          is_rollback?: boolean | null
          kernel_prompt?: string | null
          rollback_from_version?: number | null
          tool_triggers?: Json | null
          version_number?: number
          wizard_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_mode: string | null
          agent_type: string
          ai_model: string | null
          ai_provider: string | null
          compliance_rules: Json | null
          created_at: string | null
          current_version: number | null
          custom_instructions: string | null
          empathy_level: number | null
          enabled_tools: Json | null
          feedback_history: Json | null
          feedback_rules: Json | null
          formatting_rules: Json | null
          goal: string
          greeting_message: string | null
          id: string
          is_enabled: boolean
          max_messages_per_conversation: number | null
          name: string
          organization_id: string
          out_of_hours_message: string | null
          tone: string
          tool_settings: Json | null
          tool_triggers: Json | null
          updated_at: string | null
          wizard_data: Json | null
          working_hours: Json | null
        }
        Insert: {
          agent_mode?: string | null
          agent_type?: string
          ai_model?: string | null
          ai_provider?: string | null
          compliance_rules?: Json | null
          created_at?: string | null
          current_version?: number | null
          custom_instructions?: string | null
          empathy_level?: number | null
          enabled_tools?: Json | null
          feedback_history?: Json | null
          feedback_rules?: Json | null
          formatting_rules?: Json | null
          goal?: string
          greeting_message?: string | null
          id?: string
          is_enabled?: boolean
          max_messages_per_conversation?: number | null
          name?: string
          organization_id: string
          out_of_hours_message?: string | null
          tone?: string
          tool_settings?: Json | null
          tool_triggers?: Json | null
          updated_at?: string | null
          wizard_data?: Json | null
          working_hours?: Json | null
        }
        Update: {
          agent_mode?: string | null
          agent_type?: string
          ai_model?: string | null
          ai_provider?: string | null
          compliance_rules?: Json | null
          created_at?: string | null
          current_version?: number | null
          custom_instructions?: string | null
          empathy_level?: number | null
          enabled_tools?: Json | null
          feedback_history?: Json | null
          feedback_rules?: Json | null
          formatting_rules?: Json | null
          goal?: string
          greeting_message?: string | null
          id?: string
          is_enabled?: boolean
          max_messages_per_conversation?: number | null
          name?: string
          organization_id?: string
          out_of_hours_message?: string | null
          tone?: string
          tool_settings?: Json | null
          tool_triggers?: Json | null
          updated_at?: string | null
          wizard_data?: Json | null
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          action: string
          completion_tokens: number | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          integration_slug: string
          model_used: string
          organization_id: string
          prompt_tokens: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          action: string
          completion_tokens?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          integration_slug: string
          model_used: string
          organization_id: string
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          completion_tokens?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          integration_slug?: string
          model_used?: string
          organization_id?: string
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          bucket: string
          created_at: string | null
          deleted_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          id: string
          is_sample: boolean | null
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          bucket?: string
          created_at?: string | null
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          id?: string
          is_sample?: boolean | null
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string | null
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          id?: string
          is_sample?: boolean | null
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_by_user_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          organization_id: string | null
        }
        Insert: {
          action: string
          changed_by_user_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
        }
        Update: {
          action?: string
          changed_by_user_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recordings: {
        Row: {
          call_id: string
          created_at: string | null
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          organization_id: string
          recording_sid: string
          recording_url: string
          transcription: string | null
        }
        Insert: {
          call_id: string
          created_at?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          organization_id: string
          recording_sid: string
          recording_url: string
          transcription?: string | null
        }
        Update: {
          call_id?: string
          created_at?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          organization_id?: string
          recording_sid?: string
          recording_url?: string
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_recordings_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_recordings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          answered_at: string | null
          call_sid: string | null
          call_type: string | null
          contact_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          is_sample: boolean | null
          notes: string | null
          opportunity_id: string | null
          organization_id: string
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          to_number: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          call_sid?: string | null
          call_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          is_sample?: boolean | null
          notes?: string | null
          opportunity_id?: string | null
          organization_id: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string | null
          call_sid?: string | null
          call_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          is_sample?: boolean | null
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string | null
          deleted_at: string | null
          domain: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          deleted_at?: string | null
          domain?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          deleted_at?: string | null
          domain?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_memories: {
        Row: {
          contact_id: string
          created_at: string | null
          facts: Json | null
          id: string
          name_asked: boolean | null
          name_confirmed: boolean | null
          name_confirmed_at: string | null
          next_action: string | null
          next_action_date: string | null
          objections: Json | null
          organization_id: string
          original_whatsapp_name: string | null
          preferences: Json | null
          qualification: Json | null
          updated_at: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          facts?: Json | null
          id?: string
          name_asked?: boolean | null
          name_confirmed?: boolean | null
          name_confirmed_at?: string | null
          next_action?: string | null
          next_action_date?: string | null
          objections?: Json | null
          organization_id: string
          original_whatsapp_name?: string | null
          preferences?: Json | null
          qualification?: Json | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          facts?: Json | null
          id?: string
          name_asked?: boolean | null
          name_confirmed?: boolean | null
          name_confirmed_at?: string | null
          next_action?: string | null
          next_action_date?: string | null
          objections?: Json | null
          organization_id?: string
          original_whatsapp_name?: string | null
          preferences?: Json | null
          qualification?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_memories_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_memories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string | null
          company_name: string | null
          created_at: string | null
          deleted_at: string | null
          do_not_contact: boolean | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          is_sample: boolean | null
          last_name: string | null
          lifecycle_stage: Database["public"]["Enums"]["lifecycle_stage"] | null
          organization_id: string
          owner_user_id: string | null
          phone: string | null
          source: string | null
          source_external_id: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          company_id?: string | null
          company_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          do_not_contact?: boolean | null
          email?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          is_sample?: boolean | null
          last_name?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["lifecycle_stage"]
            | null
          organization_id: string
          owner_user_id?: string | null
          phone?: string | null
          source?: string | null
          source_external_id?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          company_id?: string | null
          company_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          do_not_contact?: boolean | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          is_sample?: boolean | null
          last_name?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["lifecycle_stage"]
            | null
          organization_id?: string
          owner_user_id?: string | null
          phone?: string | null
          source?: string | null
          source_external_id?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_applied: number
          id: string
          organization_id: string
          redeemed_at: string | null
          redeemed_by_admin_id: string | null
          subscription_id: string
        }
        Insert: {
          coupon_id: string
          discount_applied: number
          id?: string
          organization_id: string
          redeemed_at?: string | null
          redeemed_by_admin_id?: string | null
          subscription_id: string
        }
        Update: {
          coupon_id?: string
          discount_applied?: number
          id?: string
          organization_id?: string
          redeemed_at?: string | null
          redeemed_by_admin_id?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_redeemed_by_admin_id_fkey"
            columns: ["redeemed_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_plans: string[] | null
          code: string
          created_at: string | null
          created_by_admin_id: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_plans?: string[] | null
          code: string
          created_at?: string | null
          created_by_admin_id?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_plans?: string[] | null
          code?: string
          created_at?: string | null
          created_by_admin_id?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string | null
          field_type: string
          id: string
          is_required: boolean | null
          label: string
          module: string
          name: string
          options: Json | null
          order_index: number
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          field_type: string
          id?: string
          is_required?: boolean | null
          label: string
          module: string
          name: string
          options?: Json | null
          order_index?: number
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          label?: string
          module?: string
          name?: string
          options?: Json | null
          order_index?: number
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          created_at: string | null
          field_definition_id: string
          id: string
          module: string
          organization_id: string
          record_id: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          field_definition_id: string
          id?: string
          module: string
          organization_id: string
          record_id: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          field_definition_id?: string
          id?: string
          module?: string
          organization_id?: string
          record_id?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documentation: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_public: boolean | null
          module: string
          status: string | null
          title: string
          updated_at: string | null
          updated_by_admin_id: string | null
          version: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          module: string
          status?: string | null
          title: string
          updated_at?: string | null
          updated_by_admin_id?: string | null
          version?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          module?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          updated_by_admin_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentation_updated_by_admin_id_fkey"
            columns: ["updated_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          name: string
          organization_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          name: string
          organization_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          name?: string
          organization_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      impersonation_sessions: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          notes: string | null
          organization_id: string | null
          started_at: string
          status: string | null
          target_user_email: string
          target_user_id: string
          target_user_name: string | null
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          started_at?: string
          status?: string | null
          target_user_email: string
          target_user_id: string
          target_user_name?: string | null
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          started_at?: string
          status?: string | null
          target_user_email?: string
          target_user_id?: string
          target_user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_logs: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string | null
          created_by_user_id: string | null
          current_batch: number | null
          cursor_state: Json | null
          error_count: number | null
          errors: Json | null
          id: string
          imported_contact_ids: string[] | null
          imported_contacts: number | null
          imported_opportunities: number | null
          imported_opportunity_ids: string[] | null
          integration_slug: string
          last_processed_item: string | null
          organization_id: string
          progress_percent: number | null
          rollback_available: boolean | null
          rollback_executed_at: string | null
          skipped_contacts: number | null
          skipped_opportunities: number | null
          started_at: string | null
          status: string | null
          total_batches: number | null
          total_contacts: number | null
          total_opportunities: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          created_by_user_id?: string | null
          current_batch?: number | null
          cursor_state?: Json | null
          error_count?: number | null
          errors?: Json | null
          id?: string
          imported_contact_ids?: string[] | null
          imported_contacts?: number | null
          imported_opportunities?: number | null
          imported_opportunity_ids?: string[] | null
          integration_slug: string
          last_processed_item?: string | null
          organization_id: string
          progress_percent?: number | null
          rollback_available?: boolean | null
          rollback_executed_at?: string | null
          skipped_contacts?: number | null
          skipped_opportunities?: number | null
          started_at?: string | null
          status?: string | null
          total_batches?: number | null
          total_contacts?: number | null
          total_opportunities?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          created_by_user_id?: string | null
          current_batch?: number | null
          cursor_state?: Json | null
          error_count?: number | null
          errors?: Json | null
          id?: string
          imported_contact_ids?: string[] | null
          imported_contacts?: number | null
          imported_opportunities?: number | null
          imported_opportunity_ids?: string[] | null
          integration_slug?: string
          last_processed_item?: string | null
          organization_id?: string
          progress_percent?: number | null
          rollback_available?: boolean | null
          rollback_executed_at?: string | null
          skipped_contacts?: number | null
          skipped_opportunities?: number | null
          started_at?: string | null
          status?: string | null
          total_batches?: number | null
          total_contacts?: number | null
          total_opportunities?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          organization_id: string
          provider: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          organization_id: string
          provider: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string
          provider?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          id: string
          invited_by_user_id: string
          organization_id: string
          permission_profile_id: string | null
          status: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_by_user_id: string
          organization_id: string
          permission_profile_id?: string | null
          status?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_by_user_id?: string
          organization_id?: string
          permission_profile_id?: string | null
          status?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_permission_profile_id_fkey"
            columns: ["permission_profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string | null
          embedding: string
          id: string
          item_id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string | null
          embedding: string
          id?: string
          item_id: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string | null
          embedding?: string
          id?: string
          item_id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_edit_requests: {
        Row: {
          applied_at: string | null
          confirmed_at: string | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          organization_id: string
          proposed_changes: Json
          status: string | null
          user_request: string
        }
        Insert: {
          applied_at?: string | null
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          proposed_changes?: Json
          status?: string | null
          user_request: string
        }
        Update: {
          applied_at?: string | null
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          proposed_changes?: Json
          status?: string | null
          user_request?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_edit_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_embeddings: {
        Row: {
          agent_id: string | null
          content: string
          content_type: string
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          organization_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          content: string
          content_type: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: string
          content_type?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_embeddings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_embeddings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_item_history: {
        Row: {
          change_description: string | null
          change_source: string | null
          change_type: string | null
          changed_at: string | null
          changed_by: string | null
          conversation_context: Json | null
          id: string
          item_id: string | null
          new_content: string | null
          new_resolved_content: string | null
          new_title: string | null
          organization_id: string
          previous_content: string | null
          previous_resolved_content: string | null
          previous_title: string | null
        }
        Insert: {
          change_description?: string | null
          change_source?: string | null
          change_type?: string | null
          changed_at?: string | null
          changed_by?: string | null
          conversation_context?: Json | null
          id?: string
          item_id?: string | null
          new_content?: string | null
          new_resolved_content?: string | null
          new_title?: string | null
          organization_id: string
          previous_content?: string | null
          previous_resolved_content?: string | null
          previous_title?: string | null
        }
        Update: {
          change_description?: string | null
          change_source?: string | null
          change_type?: string | null
          changed_at?: string | null
          changed_by?: string | null
          conversation_context?: Json | null
          id?: string
          item_id?: string | null
          new_content?: string | null
          new_resolved_content?: string | null
          new_title?: string | null
          organization_id?: string
          previous_content?: string | null
          previous_resolved_content?: string | null
          previous_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_item_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_item_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          agent_id: string | null
          category: string | null
          content: string | null
          content_hash: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          global_item_id: string | null
          id: string
          inherits_global: boolean | null
          is_active: boolean | null
          last_indexed_at: string | null
          metadata: Json | null
          needs_reindex: boolean | null
          organization_id: string
          product_id: string | null
          resolved_content: string | null
          scope: string | null
          source: string | null
          source_file_path: string | null
          source_url: string | null
          status: string | null
          title: string
          type: string
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          agent_id?: string | null
          category?: string | null
          content?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          global_item_id?: string | null
          id?: string
          inherits_global?: boolean | null
          is_active?: boolean | null
          last_indexed_at?: string | null
          metadata?: Json | null
          needs_reindex?: boolean | null
          organization_id: string
          product_id?: string | null
          resolved_content?: string | null
          scope?: string | null
          source?: string | null
          source_file_path?: string | null
          source_url?: string | null
          status?: string | null
          title: string
          type: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          agent_id?: string | null
          category?: string | null
          content?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          global_item_id?: string | null
          id?: string
          inherits_global?: boolean | null
          is_active?: boolean | null
          last_indexed_at?: string | null
          metadata?: Json | null
          needs_reindex?: boolean | null
          organization_id?: string
          product_id?: string | null
          resolved_content?: string | null
          scope?: string | null
          source?: string | null
          source_file_path?: string | null
          source_url?: string | null
          status?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_global_item_id_fkey"
            columns: ["global_item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      message_thread_reads: {
        Row: {
          last_read_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_thread_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_thread_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          agent_typing: boolean | null
          agent_typing_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          awaiting_button_response: boolean | null
          button_options: Json | null
          channel: string | null
          contact_id: string
          created_at: string | null
          external_id: string | null
          first_human_response_at: string | null
          id: string
          last_inbound_at: string | null
          needs_human_attention: boolean | null
          opportunity_id: string | null
          organization_id: string
          resolved_at: string | null
          status: string
          subject: string | null
          updated_at: string | null
          whatsapp_last_inbound_at: string | null
        }
        Insert: {
          agent_typing?: boolean | null
          agent_typing_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          awaiting_button_response?: boolean | null
          button_options?: Json | null
          channel?: string | null
          contact_id: string
          created_at?: string | null
          external_id?: string | null
          first_human_response_at?: string | null
          id?: string
          last_inbound_at?: string | null
          needs_human_attention?: boolean | null
          opportunity_id?: string | null
          organization_id: string
          resolved_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string | null
          whatsapp_last_inbound_at?: string | null
        }
        Update: {
          agent_typing?: boolean | null
          agent_typing_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          awaiting_button_response?: boolean | null
          button_options?: Json | null
          channel?: string | null
          contact_id?: string
          created_at?: string | null
          external_id?: string | null
          first_human_response_at?: string | null
          id?: string
          last_inbound_at?: string | null
          needs_human_attention?: boolean | null
          opportunity_id?: string | null
          organization_id?: string
          resolved_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string | null
          whatsapp_last_inbound_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_processed: boolean | null
          content: string
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          error_code: string | null
          error_message: string | null
          id: string
          is_sample: boolean | null
          media_type: string | null
          media_urls: Json | null
          metadata: Json | null
          organization_id: string
          reply_to_message_id: string | null
          sender_agent_id: string | null
          sender_name: string | null
          sender_type: string | null
          sender_user_id: string | null
          sent_at: string | null
          template_id: string | null
          thread_id: string
          whatsapp_message_sid: string | null
          whatsapp_status: string | null
        }
        Insert: {
          ai_processed?: boolean | null
          content: string
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          is_sample?: boolean | null
          media_type?: string | null
          media_urls?: Json | null
          metadata?: Json | null
          organization_id: string
          reply_to_message_id?: string | null
          sender_agent_id?: string | null
          sender_name?: string | null
          sender_type?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          template_id?: string | null
          thread_id: string
          whatsapp_message_sid?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          ai_processed?: boolean | null
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          is_sample?: boolean | null
          media_type?: string | null
          media_urls?: Json | null
          metadata?: Json | null
          organization_id?: string
          reply_to_message_id?: string | null
          sender_agent_id?: string | null
          sender_name?: string | null
          sender_type?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          template_id?: string | null
          thread_id?: string
          whatsapp_message_sid?: string | null
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_agent_id_fkey"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount: number | null
          close_date: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          deleted_at: string | null
          id: string
          is_sample: boolean | null
          organization_id: string
          owner_user_id: string | null
          pipeline_stage_id: string
          source: string | null
          source_external_id: string | null
          status: Database["public"]["Enums"]["opportunity_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          id?: string
          is_sample?: boolean | null
          organization_id: string
          owner_user_id?: string | null
          pipeline_stage_id: string
          source?: string | null
          source_external_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          id?: string
          is_sample?: boolean | null
          organization_id?: string
          owner_user_id?: string | null
          pipeline_stage_id?: string
          source?: string | null
          source_external_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          created_by_user_id: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          organization_id: string
          scopes: string[] | null
        }
        Insert: {
          api_key: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          organization_id: string
          scopes?: string[] | null
        }
        Update: {
          api_key?: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          organization_id?: string
          scopes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_api_keys_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          config_values: Json | null
          connected_account: Json | null
          connected_at: string | null
          connected_by_user_id: string | null
          created_at: string | null
          id: string
          integration_id: string | null
          is_enabled: boolean | null
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          config_values?: Json | null
          connected_account?: Json | null
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string | null
          id?: string
          integration_id?: string | null
          is_enabled?: boolean | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          config_values?: Json | null
          connected_account?: Json | null
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string | null
          id?: string
          integration_id?: string | null
          is_enabled?: boolean | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_connected_by_user_id_fkey"
            columns: ["connected_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_integrations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "admin_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_phone_numbers: {
        Row: {
          assigned_user_id: string | null
          created_at: string | null
          friendly_name: string | null
          id: string
          inbound_settings: Json | null
          is_primary: boolean | null
          organization_id: string
          phone_number: string
          ring_strategy: string
          ring_timeout_seconds: number | null
          ring_users: string[] | null
          twilio_phone_sid: string | null
          updated_at: string | null
          voicemail_enabled: boolean | null
          voicemail_greeting: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string | null
          friendly_name?: string | null
          id?: string
          inbound_settings?: Json | null
          is_primary?: boolean | null
          organization_id: string
          phone_number: string
          ring_strategy?: string
          ring_timeout_seconds?: number | null
          ring_users?: string[] | null
          twilio_phone_sid?: string | null
          updated_at?: string | null
          voicemail_enabled?: boolean | null
          voicemail_greeting?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string | null
          friendly_name?: string | null
          id?: string
          inbound_settings?: Json | null
          is_primary?: boolean | null
          organization_id?: string
          phone_number?: string
          ring_strategy?: string
          ring_timeout_seconds?: number | null
          ring_users?: string[] | null
          twilio_phone_sid?: string | null
          updated_at?: string | null
          voicemail_enabled?: boolean | null
          voicemail_greeting?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_phone_numbers_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_phone_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage_metrics: {
        Row: {
          actions_last_30_days: number | null
          actions_last_7_days: number | null
          calculated_at: string | null
          id: string
          last_user_activity_at: string | null
          organization_id: string
          storage_used_bytes: number | null
          total_contacts: number | null
          total_opportunities: number | null
          total_tasks: number | null
        }
        Insert: {
          actions_last_30_days?: number | null
          actions_last_7_days?: number | null
          calculated_at?: string | null
          id?: string
          last_user_activity_at?: string | null
          organization_id: string
          storage_used_bytes?: number | null
          total_contacts?: number | null
          total_opportunities?: number | null
          total_tasks?: number | null
        }
        Update: {
          actions_last_30_days?: number | null
          actions_last_7_days?: number | null
          calculated_at?: string | null
          id?: string
          last_user_activity_at?: string | null
          organization_id?: string
          storage_used_bytes?: number | null
          total_contacts?: number | null
          total_opportunities?: number | null
          total_tasks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          default_currency: string | null
          default_locale: string | null
          duplicate_check_mode:
            | Database["public"]["Enums"]["duplicate_check_mode"]
            | null
          duplicate_enforce_block: boolean | null
          enable_companies_module: boolean | null
          id: string
          logo_size: number | null
          logo_url: string | null
          name: string
          onboarding_completed_at: string | null
          onboarding_step: Database["public"]["Enums"]["onboarding_step"] | null
          slug: string
          suspended_at: string | null
          suspended_by_admin_id: string | null
          suspended_reason: string | null
          theme_dark_mode: boolean | null
          theme_primary_color: string | null
          theme_sidebar_color: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_currency?: string | null
          default_locale?: string | null
          duplicate_check_mode?:
            | Database["public"]["Enums"]["duplicate_check_mode"]
            | null
          duplicate_enforce_block?: boolean | null
          enable_companies_module?: boolean | null
          id?: string
          logo_size?: number | null
          logo_url?: string | null
          name: string
          onboarding_completed_at?: string | null
          onboarding_step?:
            | Database["public"]["Enums"]["onboarding_step"]
            | null
          slug: string
          suspended_at?: string | null
          suspended_by_admin_id?: string | null
          suspended_reason?: string | null
          theme_dark_mode?: boolean | null
          theme_primary_color?: string | null
          theme_sidebar_color?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_currency?: string | null
          default_locale?: string | null
          duplicate_check_mode?:
            | Database["public"]["Enums"]["duplicate_check_mode"]
            | null
          duplicate_enforce_block?: boolean | null
          enable_companies_module?: boolean | null
          id?: string
          logo_size?: number | null
          logo_url?: string | null
          name?: string
          onboarding_completed_at?: string | null
          onboarding_step?:
            | Database["public"]["Enums"]["onboarding_step"]
            | null
          slug?: string
          suspended_at?: string | null
          suspended_by_admin_id?: string | null
          suspended_reason?: string | null
          theme_dark_mode?: boolean | null
          theme_primary_color?: string | null
          theme_sidebar_color?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_suspended_by_admin_id_fkey"
            columns: ["suspended_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_profiles: {
        Row: {
          created_at: string | null
          id: string
          name: string
          organization_id: string
          permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string | null
          id: string
          name: string
          order_index: number
          organization_id: string
          type: Database["public"]["Enums"]["pipeline_stage_type"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          order_index: number
          organization_id: string
          type?: Database["public"]["Enums"]["pipeline_stage_type"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          order_index?: number
          organization_id?: string
          type?: Database["public"]["Enums"]["pipeline_stage_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          description: string | null
          display_name: string
          features: Json | null
          free_seats_limit: number | null
          id: string
          is_active: boolean | null
          max_contacts: number | null
          max_seats: number | null
          max_storage_mb: number | null
          name: string
          price_per_seat_monthly: number | null
          price_per_seat_yearly: number | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_name: string
          features?: Json | null
          free_seats_limit?: number | null
          id?: string
          is_active?: boolean | null
          max_contacts?: number | null
          max_seats?: number | null
          max_storage_mb?: number | null
          name: string
          price_per_seat_monthly?: number | null
          price_per_seat_yearly?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_name?: string
          features?: Json | null
          free_seats_limit?: number | null
          id?: string
          is_active?: boolean | null
          max_contacts?: number | null
          max_seats?: number | null
          max_storage_mb?: number | null
          name?: string
          price_per_seat_monthly?: number | null
          price_per_seat_yearly?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          organization_id: string
          product_group: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          organization_id: string
          product_group?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          organization_id?: string
          product_group?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string | null
          filters: Json | null
          id: string
          is_default: boolean | null
          module: string
          name: string
          organization_id: string
          owner_user_id: string | null
          sort: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          is_default?: boolean | null
          module: string
          name: string
          organization_id: string
          owner_user_id?: string | null
          sort?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          is_default?: boolean | null
          module?: string
          name?: string
          organization_id?: string
          owner_user_id?: string | null
          sort?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          ai_agent_id: string | null
          channel: string | null
          contact_id: string
          content: string
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          organization_id: string
          reason: string | null
          retry_count: number | null
          scheduled_at: string
          sent_at: string | null
          status: string | null
          thread_id: string | null
          updated_at: string | null
        }
        Insert: {
          ai_agent_id?: string | null
          channel?: string | null
          contact_id: string
          content: string
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          organization_id: string
          reason?: string | null
          retry_count?: number | null
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_agent_id?: string | null
          channel?: string | null
          contact_id?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          retry_count?: number | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_usage: {
        Row: {
          current_seat_count: number
          id: string
          last_calculated_at: string | null
          subscription_id: string
        }
        Insert: {
          current_seat_count?: number
          id?: string
          last_calculated_at?: string | null
          subscription_id: string
        }
        Update: {
          current_seat_count?: number
          id?: string
          last_calculated_at?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: true
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_period: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          extended_trial_days: number | null
          id: string
          is_free_plan: boolean | null
          locked_price_monthly: number | null
          locked_price_yearly: number | null
          max_seats: number | null
          organization_id: string
          original_trial_days: number | null
          plan_id: string | null
          plan_name: string | null
          price_locked_at: string | null
          price_per_seat: number | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          trial_ends_at: string | null
          trial_extended_by_admin_id: string | null
          trial_extension_reason: string | null
          updated_at: string | null
        }
        Insert: {
          billing_period?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          extended_trial_days?: number | null
          id?: string
          is_free_plan?: boolean | null
          locked_price_monthly?: number | null
          locked_price_yearly?: number | null
          max_seats?: number | null
          organization_id: string
          original_trial_days?: number | null
          plan_id?: string | null
          plan_name?: string | null
          price_locked_at?: string | null
          price_per_seat?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_ends_at?: string | null
          trial_extended_by_admin_id?: string | null
          trial_extension_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_period?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          extended_trial_days?: number | null
          id?: string
          is_free_plan?: boolean | null
          locked_price_monthly?: number | null
          locked_price_yearly?: number | null
          max_seats?: number | null
          organization_id?: string
          original_trial_days?: number | null
          plan_id?: string | null
          plan_name?: string | null
          price_locked_at?: string | null
          price_per_seat?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_ends_at?: string | null
          trial_extended_by_admin_id?: string | null
          trial_extension_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_trial_extended_by_admin_id_fkey"
            columns: ["trial_extended_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_assignments: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_user_id: string
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          id: string
          is_sample: boolean | null
          opportunity_id: string | null
          organization_id: string
          priority: Database["public"]["Enums"]["task_priority"] | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_user_id: string
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_sample?: boolean | null
          opportunity_id?: string | null
          organization_id: string
          priority?: Database["public"]["Enums"]["task_priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_sample?: boolean | null
          opportunity_id?: string | null
          organization_id?: string
          priority?: Database["public"]["Enums"]["task_priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          permission_profile_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          permission_profile_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          permission_profile_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_permission_profile_id_fkey"
            columns: ["permission_profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          device_id: string
          id: string
          last_seen_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          id?: string
          last_seen_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: string
          last_seen_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string | null
          email: string
          first_name: string | null
          full_name: string
          id: string
          is_platform_admin: boolean | null
          last_name: string | null
          locale: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          full_name: string
          id?: string
          is_platform_admin?: boolean | null
          last_name?: string | null
          locale?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          full_name?: string
          id?: string
          is_platform_admin?: boolean | null
          last_name?: string | null
          locale?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_template_actions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          position: number
          section: string | null
          template_id: string
          title: string
          type: string
          value: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          position?: number
          section?: string | null
          template_id: string
          title: string
          type: string
          value?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          position?: number
          section?: string | null
          template_id?: string
          title?: string
          type?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_template_actions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string | null
          footer: string | null
          friendly_name: string
          header: string | null
          id: string
          is_active: boolean | null
          language: string | null
          last_synced_at: string | null
          metadata: Json | null
          organization_id: string
          rejection_reason: string | null
          source: string | null
          status: string | null
          template_type: string | null
          twilio_content_sid: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string | null
          footer?: string | null
          friendly_name: string
          header?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          organization_id: string
          rejection_reason?: string | null
          source?: string | null
          status?: string | null
          template_type?: string | null
          twilio_content_sid: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string | null
          footer?: string | null
          friendly_name?: string
          header?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          organization_id?: string
          rejection_reason?: string | null
          source?: string | null
          status?: string | null
          template_type?: string | null
          twilio_content_sid?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      best_time_per_contact: {
        Row: {
          best_connect_rate: number | null
          best_time_slot: string | null
          contact_id: string | null
          times_connected: number | null
          total_attempts: number | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_user_id: { Args: never; Returns: string }
      current_user_managed_org_ids: { Args: never; Returns: string[] }
      current_user_org_ids: { Args: never; Returns: string[] }
      get_opportunity_stage_counts: {
        Args: { org_id: string }
        Returns: {
          opportunity_count: number
          stage_id: string
          total_amount: number
        }[]
      }
      handle_user_signup: {
        Args: {
          p_email: string
          p_full_name: string
          p_locale?: string
          p_organization_name: string
          p_timezone?: string
        }
        Returns: Json
      }
      is_admin_user: { Args: never; Returns: boolean }
      record_failed_admin_login: {
        Args: { p_email: string; p_ip: string }
        Returns: undefined
      }
      reset_admin_login_attempts: {
        Args: { p_admin_id: string }
        Returns: undefined
      }
      search_knowledge: {
        Args: {
          agent_id_filter?: string
          match_count?: number
          match_threshold?: number
          org_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          content_type: string
          id: string
          metadata: Json
          similarity: number
          title: string
        }[]
      }
      search_knowledge_all: {
        Args: {
          match_count?: number
          match_threshold?: number
          org_id: string
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          item_id: string
          resolved_content: string
          scope: string
          similarity: number
          title: string
        }[]
      }
      search_knowledge_chunks: {
        Args: {
          agent_id_filter?: string
          match_count?: number
          match_threshold?: number
          org_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          content_type: string
          id: string
          item_id: string
          similarity: number
          title: string
        }[]
      }
      search_knowledge_global: {
        Args: {
          match_count?: number
          match_threshold?: number
          org_id: string
          p_categories?: string[]
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          item_id: string
          resolved_content: string
          similarity: number
          title: string
        }[]
      }
      search_knowledge_product: {
        Args: {
          match_count?: number
          match_threshold?: number
          org_id: string
          p_categories?: string[]
          p_product_id: string
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          item_id: string
          resolved_content: string
          similarity: number
          title: string
        }[]
      }
      update_organization_usage_metrics: {
        Args: { org_id: string }
        Returns: undefined
      }
      user_has_org_access: { Args: { org_id: string }; Returns: boolean }
    }
    Enums: {
      activity_type:
        | "note"
        | "message"
        | "call"
        | "task"
        | "status_change"
        | "pipeline_stage_change"
        | "system"
      app_role: "admin" | "sales_rep" | "viewer"
      call_type: "made" | "received" | "scheduled"
      duplicate_check_mode: "none" | "email" | "phone" | "email_or_phone"
      lifecycle_stage: "lead" | "customer" | "inactive"
      onboarding_step:
        | "invites"
        | "first_contact"
        | "first_opportunity"
        | "completed"
      opportunity_status: "open" | "won" | "lost"
      pipeline_stage_type: "custom" | "won" | "lost"
      subscription_status: "active" | "trialing" | "past_due" | "canceled"
      task_priority: "low" | "medium" | "high"
      task_status: "open" | "completed" | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "note",
        "message",
        "call",
        "task",
        "status_change",
        "pipeline_stage_change",
        "system",
      ],
      app_role: ["admin", "sales_rep", "viewer"],
      call_type: ["made", "received", "scheduled"],
      duplicate_check_mode: ["none", "email", "phone", "email_or_phone"],
      lifecycle_stage: ["lead", "customer", "inactive"],
      onboarding_step: [
        "invites",
        "first_contact",
        "first_opportunity",
        "completed",
      ],
      opportunity_status: ["open", "won", "lost"],
      pipeline_stage_type: ["custom", "won", "lost"],
      subscription_status: ["active", "trialing", "past_due", "canceled"],
      task_priority: ["low", "medium", "high"],
      task_status: ["open", "completed", "canceled"],
    },
  },
} as const
