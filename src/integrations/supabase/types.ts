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
          media_source_url: string | null
          media_status: string | null
          media_storage_url: string | null
          occurred_at: string | null
          opportunity_id: string | null
          organization_id: string
          source_external_id: string | null
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
          media_source_url?: string | null
          media_status?: string | null
          media_storage_url?: string | null
          occurred_at?: string | null
          opportunity_id?: string | null
          organization_id: string
          source_external_id?: string | null
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
          media_source_url?: string | null
          media_status?: string | null
          media_storage_url?: string | null
          occurred_at?: string | null
          opportunity_id?: string | null
          organization_id?: string
          source_external_id?: string | null
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
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "vw_intel_won_vs_lost_30d"
            referencedColumns: ["opportunity_id"]
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
      admin_one_off_job_items: {
        Row: {
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          item_type: string
          job_id: string
          last_error: string | null
          payload: Json
          status: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          item_type: string
          job_id: string
          last_error?: string | null
          payload?: Json
          status?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          item_type?: string
          job_id?: string
          last_error?: string | null
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_one_off_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "admin_one_off_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_one_off_jobs: {
        Row: {
          confirm_token_used: string | null
          consecutive_failures: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_summary: Json
          job_key: string
          mode: string
          output_summary: Json
          started_at: string
          status: string
        }
        Insert: {
          confirm_token_used?: string | null
          consecutive_failures?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_summary?: Json
          job_key: string
          mode: string
          output_summary?: Json
          started_at?: string
          status?: string
        }
        Update: {
          confirm_token_used?: string | null
          consecutive_failures?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_summary?: Json
          job_key?: string
          mode?: string
          output_summary?: Json
          started_at?: string
          status?: string
        }
        Relationships: []
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
          api_key: string | null
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
          model: string | null
          name: string
          organization_id: string
          out_of_hours_message: string | null
          provider: string | null
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
          api_key?: string | null
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
          model?: string | null
          name?: string
          organization_id: string
          out_of_hours_message?: string | null
          provider?: string | null
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
          api_key?: string | null
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
          model?: string | null
          name?: string
          organization_id?: string
          out_of_hours_message?: string | null
          provider?: string | null
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
      ai_interaction_logs: {
        Row: {
          contact_id: string | null
          created_at: string | null
          detected_intent: string | null
          estimated_cost_usd: number | null
          final_response: string | null
          generation_latency_ms: number | null
          generation_model: string | null
          guard_input_tokens: number | null
          guard_model: string | null
          guard_output_tokens: number | null
          id: string
          input_guard_latency_ms: number | null
          input_guard_result: Json | null
          input_tokens: number | null
          organization_id: string | null
          output_guard_latency_ms: number | null
          output_guard_result: Json | null
          output_tokens: number | null
          provider: string | null
          rag_chunks_used: Json | null
          rag_latency_ms: number | null
          rag_products_detected: string[] | null
          rag_query: string | null
          raw_response: string | null
          system_prompt_hash: string | null
          thread_id: string | null
          tool_iterations: number | null
          tools_used: Json | null
          total_latency_ms: number | null
          user_message: string
          was_rewritten: boolean | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          detected_intent?: string | null
          estimated_cost_usd?: number | null
          final_response?: string | null
          generation_latency_ms?: number | null
          generation_model?: string | null
          guard_input_tokens?: number | null
          guard_model?: string | null
          guard_output_tokens?: number | null
          id?: string
          input_guard_latency_ms?: number | null
          input_guard_result?: Json | null
          input_tokens?: number | null
          organization_id?: string | null
          output_guard_latency_ms?: number | null
          output_guard_result?: Json | null
          output_tokens?: number | null
          provider?: string | null
          rag_chunks_used?: Json | null
          rag_latency_ms?: number | null
          rag_products_detected?: string[] | null
          rag_query?: string | null
          raw_response?: string | null
          system_prompt_hash?: string | null
          thread_id?: string | null
          tool_iterations?: number | null
          tools_used?: Json | null
          total_latency_ms?: number | null
          user_message: string
          was_rewritten?: boolean | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          detected_intent?: string | null
          estimated_cost_usd?: number | null
          final_response?: string | null
          generation_latency_ms?: number | null
          generation_model?: string | null
          guard_input_tokens?: number | null
          guard_model?: string | null
          guard_output_tokens?: number | null
          id?: string
          input_guard_latency_ms?: number | null
          input_guard_result?: Json | null
          input_tokens?: number | null
          organization_id?: string | null
          output_guard_latency_ms?: number | null
          output_guard_result?: Json | null
          output_tokens?: number | null
          provider?: string | null
          rag_chunks_used?: Json | null
          rag_latency_ms?: number | null
          rag_products_detected?: string[] | null
          rag_query?: string | null
          raw_response?: string | null
          system_prompt_hash?: string | null
          thread_id?: string | null
          tool_iterations?: number | null
          tools_used?: Json | null
          total_latency_ms?: number | null
          user_message?: string
          was_rewritten?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_interaction_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interaction_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interaction_logs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
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
          estimated_cost_usd: number | null
          id: string
          integration_slug: string
          job_id: string | null
          model_used: string
          organization_id: string
          prompt_tokens: number | null
          provider: string | null
          source: string | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          action: string
          completion_tokens?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          estimated_cost_usd?: number | null
          id?: string
          integration_slug: string
          job_id?: string | null
          model_used: string
          organization_id: string
          prompt_tokens?: number | null
          provider?: string | null
          source?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          completion_tokens?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          estimated_cost_usd?: number | null
          id?: string
          integration_slug?: string
          job_id?: string | null
          model_used?: string
          organization_id?: string
          prompt_tokens?: number | null
          provider?: string | null
          source?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "intelligence_jobs"
            referencedColumns: ["id"]
          },
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
      audio_transcriptions: {
        Row: {
          created_at: string
          id: string
          language: string | null
          message_id: string
          organization_id: string
          provider: string
          raw_response: Json | null
          transcript: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          message_id: string
          organization_id: string
          provider: string
          raw_response?: Json | null
          transcript?: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          message_id?: string
          organization_id?: string
          provider?: string
          raw_response?: Json | null
          transcript?: string
          version?: string
        }
        Relationships: []
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
      backup_meta_backfill_2026_05_28_contacts: {
        Row: {
          attribution_path: string[] | null
          contact_id: string
          email: string | null
          full_name: string | null
          job_id: string | null
          metadata: Json | null
          organization_id: string
          phone: string | null
          snapshot_at: string
          source: string | null
          source_external_id: string | null
        }
        Insert: {
          attribution_path?: string[] | null
          contact_id: string
          email?: string | null
          full_name?: string | null
          job_id?: string | null
          metadata?: Json | null
          organization_id: string
          phone?: string | null
          snapshot_at?: string
          source?: string | null
          source_external_id?: string | null
        }
        Update: {
          attribution_path?: string[] | null
          contact_id?: string
          email?: string | null
          full_name?: string | null
          job_id?: string | null
          metadata?: Json | null
          organization_id?: string
          phone?: string | null
          snapshot_at?: string
          source?: string | null
          source_external_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_meta_backfill_2026_05_28_contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "admin_one_off_jobs"
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
            foreignKeyName: "calls_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "vw_intel_won_vs_lost_30d"
            referencedColumns: ["opportunity_id"]
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
      capi_event_log: {
        Row: {
          attempt_count: number
          contact_id: string | null
          created_at: string
          event_id: string
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          last_attempt_at: string | null
          meta_error: string | null
          meta_response: Json | null
          next_retry_at: string | null
          opportunity_id: string | null
          organization_id: string
          payload: Json
          status: string
          test_event_code: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          contact_id?: string | null
          created_at?: string
          event_id: string
          event_name: string
          event_source_url?: string | null
          event_time: string
          id?: string
          last_attempt_at?: string | null
          meta_error?: string | null
          meta_response?: Json | null
          next_retry_at?: string | null
          opportunity_id?: string | null
          organization_id: string
          payload: Json
          status?: string
          test_event_code?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          contact_id?: string | null
          created_at?: string
          event_id?: string
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          last_attempt_at?: string | null
          meta_error?: string | null
          meta_response?: Json | null
          next_retry_at?: string | null
          opportunity_id?: string | null
          organization_id?: string
          payload?: Json
          status?: string
          test_event_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capi_event_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_event_log_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_event_log_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "vw_intel_won_vs_lost_30d"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "capi_event_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_endpoints: {
        Row: {
          assigned_user_id: string | null
          channel: string
          coexistence_enabled: boolean
          created_at: string
          current_tier: number | null
          default_context_type: string
          display_name: string | null
          external_account_id: string | null
          external_address: string | null
          id: string
          inbound_settings: Json | null
          is_active: boolean
          messaging_limit_per_24h: number | null
          metadata: Json
          organization_id: string
          organization_integration_id: string | null
          provider: string
          purpose: string
          quality_rating: string | null
          sender_sid: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          channel: string
          coexistence_enabled?: boolean
          created_at?: string
          current_tier?: number | null
          default_context_type?: string
          display_name?: string | null
          external_account_id?: string | null
          external_address?: string | null
          id?: string
          inbound_settings?: Json | null
          is_active?: boolean
          messaging_limit_per_24h?: number | null
          metadata?: Json
          organization_id: string
          organization_integration_id?: string | null
          provider?: string
          purpose?: string
          quality_rating?: string | null
          sender_sid?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          channel?: string
          coexistence_enabled?: boolean
          created_at?: string
          current_tier?: number | null
          default_context_type?: string
          display_name?: string | null
          external_account_id?: string | null
          external_address?: string | null
          id?: string
          inbound_settings?: Json | null
          is_active?: boolean
          messaging_limit_per_24h?: number | null
          metadata?: Json
          organization_id?: string
          organization_integration_id?: string | null
          provider?: string
          purpose?: string
          quality_rating?: string | null
          sender_sid?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_endpoints_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_endpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_endpoints_organization_integration_id_fkey"
            columns: ["organization_integration_id"]
            isOneToOne: false
            referencedRelation: "organization_integrations"
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
          source: string | null
          source_external_id: string | null
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
          source?: string | null
          source_external_id?: string | null
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
          source?: string | null
          source_external_id?: string | null
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
          ad_referral_body: string | null
          ad_referral_captured_at: string | null
          ad_referral_ctwa_clid: string | null
          ad_referral_headline: string | null
          ad_referral_media_url: string | null
          ad_referral_source_id: string | null
          ad_referral_source_type: string | null
          ad_referral_source_url: string | null
          address_city: string | null
          address_neighborhood: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          attribution_path: string[]
          avg_response_time_seconds: number | null
          client_ip_address: unknown
          client_user_agent: string | null
          company_id: string | null
          company_name: string | null
          cpf: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          do_not_contact: boolean | null
          email: string | null
          engagement_score: number | null
          fbclid: string | null
          fbclid_captured_at: string | null
          first_name: string | null
          full_name: string
          gclid: string | null
          id: string
          is_sample: boolean | null
          landing_url: string | null
          last_name: string | null
          lifecycle_stage: Database["public"]["Enums"]["lifecycle_stage"] | null
          marketing_campaign_id: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_lead_id: string | null
          nationality: string | null
          organization_id: string
          owner_user_id: string | null
          phone: string | null
          phone_normalized: string | null
          referrer_url: string | null
          rg: string | null
          rg_issuer: string | null
          source: string | null
          source_external_id: string | null
          updated_at: string | null
          updated_by: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_referral_body?: string | null
          ad_referral_captured_at?: string | null
          ad_referral_ctwa_clid?: string | null
          ad_referral_headline?: string | null
          ad_referral_media_url?: string | null
          ad_referral_source_id?: string | null
          ad_referral_source_type?: string | null
          ad_referral_source_url?: string | null
          address_city?: string | null
          address_neighborhood?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          attribution_path?: string[]
          avg_response_time_seconds?: number | null
          client_ip_address?: unknown
          client_user_agent?: string | null
          company_id?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          do_not_contact?: boolean | null
          email?: string | null
          engagement_score?: number | null
          fbclid?: string | null
          fbclid_captured_at?: string | null
          first_name?: string | null
          full_name: string
          gclid?: string | null
          id?: string
          is_sample?: boolean | null
          landing_url?: string | null
          last_name?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["lifecycle_stage"]
            | null
          marketing_campaign_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_lead_id?: string | null
          nationality?: string | null
          organization_id: string
          owner_user_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          referrer_url?: string | null
          rg?: string | null
          rg_issuer?: string | null
          source?: string | null
          source_external_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_referral_body?: string | null
          ad_referral_captured_at?: string | null
          ad_referral_ctwa_clid?: string | null
          ad_referral_headline?: string | null
          ad_referral_media_url?: string | null
          ad_referral_source_id?: string | null
          ad_referral_source_type?: string | null
          ad_referral_source_url?: string | null
          address_city?: string | null
          address_neighborhood?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          attribution_path?: string[]
          avg_response_time_seconds?: number | null
          client_ip_address?: unknown
          client_user_agent?: string | null
          company_id?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          do_not_contact?: boolean | null
          email?: string | null
          engagement_score?: number | null
          fbclid?: string | null
          fbclid_captured_at?: string | null
          first_name?: string | null
          full_name?: string
          gclid?: string | null
          id?: string
          is_sample?: boolean | null
          landing_url?: string | null
          last_name?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["lifecycle_stage"]
            | null
          marketing_campaign_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_lead_id?: string | null
          nationality?: string | null
          organization_id?: string
          owner_user_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          referrer_url?: string | null
          rg?: string | null
          rg_issuer?: string | null
          source?: string | null
          source_external_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
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
            foreignKeyName: "contacts_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_ad_performance"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "contacts_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_funnel"
            referencedColumns: ["marketing_campaign_id"]
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
      contacts_merge_log: {
        Row: {
          id: string
          keeper_email_before: string | null
          keeper_full_name_before: string | null
          keeper_id: string
          keeper_phone_before: string | null
          loser_email: string | null
          loser_full_name: string | null
          loser_id: string
          loser_phone_before: string | null
          merged_at: string
          organization_id: string
          phone_canonical: string
        }
        Insert: {
          id?: string
          keeper_email_before?: string | null
          keeper_full_name_before?: string | null
          keeper_id: string
          keeper_phone_before?: string | null
          loser_email?: string | null
          loser_full_name?: string | null
          loser_id: string
          loser_phone_before?: string | null
          merged_at?: string
          organization_id: string
          phone_canonical: string
        }
        Update: {
          id?: string
          keeper_email_before?: string | null
          keeper_full_name_before?: string | null
          keeper_id?: string
          keeper_phone_before?: string | null
          loser_email?: string | null
          loser_full_name?: string | null
          loser_id?: string
          loser_phone_before?: string | null
          merged_at?: string
          organization_id?: string
          phone_canonical?: string
        }
        Relationships: []
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
          source_external_id: string | null
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
          source_external_id?: string | null
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
          source_external_id?: string | null
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
      document_submissions: {
        Row: {
          attachment_id: string
          contact_id: string
          created_at: string
          deleted_at: string | null
          document_type_id: string
          id: string
          organization_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: string
          updated_at: string
          uploaded_at: string
          uploaded_by_user_id: string
        }
        Insert: {
          attachment_id: string
          contact_id: string
          created_at?: string
          deleted_at?: string | null
          document_type_id: string
          id?: string
          organization_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_user_id: string
        }
        Update: {
          attachment_id?: string
          contact_id?: string
          created_at?: string
          deleted_at?: string | null
          document_type_id?: string
          id?: string
          organization_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_submissions_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_submissions_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_required: boolean
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_types_organization_id_fkey"
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
      escalation_targets: {
        Row: {
          category_id: string | null
          created_at: string
          escalate_after_minutes: number
          id: string
          is_active: boolean
          name: string
          organization_id: string
          priority: string | null
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          escalate_after_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          priority?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          escalate_after_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          priority?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_targets_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_mappings: {
        Row: {
          created_at: string
          entity_type: string
          external_id: string
          external_metadata: Json
          id: string
          integration_slug: string
          internal_id: string
          last_synced_at: string | null
          organization_id: string
          sync_error: string | null
          sync_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          external_id: string
          external_metadata?: Json
          id?: string
          integration_slug: string
          internal_id: string
          last_synced_at?: string | null
          organization_id: string
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          external_id?: string
          external_metadata?: Json
          id?: string
          integration_slug?: string
          internal_id?: string
          last_synced_at?: string | null
          organization_id?: string
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          imported_activity_ids: string[] | null
          imported_companies: number | null
          imported_company_ids: string[] | null
          imported_contact_ids: string[] | null
          imported_contacts: number | null
          imported_custom_fields: number | null
          imported_events: number | null
          imported_notes: number | null
          imported_opportunities: number | null
          imported_opportunity_ids: string[] | null
          imported_task_ids: string[] | null
          imported_tasks: number | null
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
          total_companies: number | null
          total_contacts: number | null
          total_custom_fields: number | null
          total_events: number | null
          total_notes: number | null
          total_opportunities: number | null
          total_tasks: number | null
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
          imported_activity_ids?: string[] | null
          imported_companies?: number | null
          imported_company_ids?: string[] | null
          imported_contact_ids?: string[] | null
          imported_contacts?: number | null
          imported_custom_fields?: number | null
          imported_events?: number | null
          imported_notes?: number | null
          imported_opportunities?: number | null
          imported_opportunity_ids?: string[] | null
          imported_task_ids?: string[] | null
          imported_tasks?: number | null
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
          total_companies?: number | null
          total_contacts?: number | null
          total_custom_fields?: number | null
          total_events?: number | null
          total_notes?: number | null
          total_opportunities?: number | null
          total_tasks?: number | null
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
          imported_activity_ids?: string[] | null
          imported_companies?: number | null
          imported_company_ids?: string[] | null
          imported_contact_ids?: string[] | null
          imported_contacts?: number | null
          imported_custom_fields?: number | null
          imported_events?: number | null
          imported_notes?: number | null
          imported_opportunities?: number | null
          imported_opportunity_ids?: string[] | null
          imported_task_ids?: string[] | null
          imported_tasks?: number | null
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
          total_companies?: number | null
          total_contacts?: number | null
          total_custom_fields?: number | null
          total_events?: number | null
          total_notes?: number | null
          total_opportunities?: number | null
          total_tasks?: number | null
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
      integration_audit_logs: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          event_id: string | null
          id: string
          integration_slug: string | null
          job_id: string | null
          organization_id: string
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          details?: Json
          event_id?: string | null
          id?: string
          integration_slug?: string | null
          job_id?: string | null
          organization_id: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          event_id?: string | null
          id?: string
          integration_slug?: string | null
          job_id?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_audit_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "integration_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_audit_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "integration_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id: string
          idempotency_key: string
          occurred_at: string
          organization_id: string
          payload: Json
          published_at: string | null
          status: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id?: string
          idempotency_key: string
          occurred_at?: string
          organization_id: string
          payload: Json
          published_at?: string | null
          status?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
          published_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          metadata: Json | null
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_inbound_dead_letter_archive: {
        Row: {
          archived_at: string
          archived_by: string | null
          dead_letter_reason: string | null
          event_type: string | null
          id: string
          inbound_event_id: string
          integration_slug: string
          organization_id: string | null
          raw_headers: Json | null
          raw_payload: Json | null
          retry_count: number | null
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          dead_letter_reason?: string | null
          event_type?: string | null
          id?: string
          inbound_event_id: string
          integration_slug: string
          organization_id?: string | null
          raw_headers?: Json | null
          raw_payload?: Json | null
          retry_count?: number | null
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          dead_letter_reason?: string | null
          event_type?: string | null
          id?: string
          inbound_event_id?: string
          integration_slug?: string
          organization_id?: string | null
          raw_headers?: Json | null
          raw_payload?: Json | null
          retry_count?: number | null
        }
        Relationships: []
      }
      integration_inbound_dry_run_log: {
        Row: {
          created_at: string
          diff_summary: Json | null
          event_version: number | null
          handler_key: string | null
          id: string
          inbound_event_id: string
          integration_slug: string
          intended_actions: Json
          legacy_actual: Json | null
          outcome: string
          trace_id: string | null
        }
        Insert: {
          created_at?: string
          diff_summary?: Json | null
          event_version?: number | null
          handler_key?: string | null
          id?: string
          inbound_event_id: string
          integration_slug: string
          intended_actions: Json
          legacy_actual?: Json | null
          outcome: string
          trace_id?: string | null
        }
        Update: {
          created_at?: string
          diff_summary?: Json | null
          event_version?: number | null
          handler_key?: string | null
          id?: string
          inbound_event_id?: string
          integration_slug?: string
          intended_actions?: Json
          legacy_actual?: Json | null
          outcome?: string
          trace_id?: string | null
        }
        Relationships: []
      }
      integration_inbound_event_claims: {
        Row: {
          claimed_at: string
          claimed_by: string | null
          expires_at: string
          handler_key: string
          inbound_event_id: string
        }
        Insert: {
          claimed_at?: string
          claimed_by?: string | null
          expires_at?: string
          handler_key: string
          inbound_event_id: string
        }
        Update: {
          claimed_at?: string
          claimed_by?: string | null
          expires_at?: string
          handler_key?: string
          inbound_event_id?: string
        }
        Relationships: []
      }
      integration_inbound_events: {
        Row: {
          aggregate_id: string | null
          aggregate_type: string | null
          claimed_at: string | null
          claimed_by: string | null
          correlation_id: string | null
          dead_letter_reason: string | null
          error_classification: string | null
          event_version: number
          expires_at: string
          external_id: string | null
          handler_key: string | null
          headers: Json | null
          http_method: string | null
          id: string
          idempotency_key: string | null
          integration_slug: string
          last_attempt_at: string | null
          max_attempts: number
          next_run_at: string | null
          organization_id: string | null
          parse_attempts: number
          parser_function: string | null
          parser_version: number | null
          process_error: string | null
          process_status: string
          processed_at: string | null
          raw_headers: Json | null
          raw_payload: Json
          received_at: string
          replay_count: number
          request_path: string | null
          resulting_contact_id: string | null
          resulting_message_id: string | null
          resulting_opportunity_id: string | null
          retry_count: number
          sequence_number: number | null
          shadow_mode: boolean
          signature_algo: string | null
          signature_valid: boolean | null
          source_event: string
          source_ip: unknown
          trace_id: string | null
        }
        Insert: {
          aggregate_id?: string | null
          aggregate_type?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          correlation_id?: string | null
          dead_letter_reason?: string | null
          error_classification?: string | null
          event_version?: number
          expires_at?: string
          external_id?: string | null
          handler_key?: string | null
          headers?: Json | null
          http_method?: string | null
          id?: string
          idempotency_key?: string | null
          integration_slug: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_run_at?: string | null
          organization_id?: string | null
          parse_attempts?: number
          parser_function?: string | null
          parser_version?: number | null
          process_error?: string | null
          process_status?: string
          processed_at?: string | null
          raw_headers?: Json | null
          raw_payload: Json
          received_at?: string
          replay_count?: number
          request_path?: string | null
          resulting_contact_id?: string | null
          resulting_message_id?: string | null
          resulting_opportunity_id?: string | null
          retry_count?: number
          sequence_number?: number | null
          shadow_mode?: boolean
          signature_algo?: string | null
          signature_valid?: boolean | null
          source_event: string
          source_ip?: unknown
          trace_id?: string | null
        }
        Update: {
          aggregate_id?: string | null
          aggregate_type?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          correlation_id?: string | null
          dead_letter_reason?: string | null
          error_classification?: string | null
          event_version?: number
          expires_at?: string
          external_id?: string | null
          handler_key?: string | null
          headers?: Json | null
          http_method?: string | null
          id?: string
          idempotency_key?: string | null
          integration_slug?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_run_at?: string | null
          organization_id?: string | null
          parse_attempts?: number
          parser_function?: string | null
          parser_version?: number | null
          process_error?: string | null
          process_status?: string
          processed_at?: string | null
          raw_headers?: Json | null
          raw_payload?: Json
          received_at?: string
          replay_count?: number
          request_path?: string | null
          resulting_contact_id?: string | null
          resulting_message_id?: string | null
          resulting_opportunity_id?: string | null
          retry_count?: number
          sequence_number?: number | null
          shadow_mode?: boolean
          signature_algo?: string | null
          signature_valid?: boolean | null
          source_event?: string
          source_ip?: unknown
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_inbound_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_events_resulting_contact_id_fkey"
            columns: ["resulting_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_events_resulting_message_id_fkey"
            columns: ["resulting_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_events_resulting_opportunity_id_fkey"
            columns: ["resulting_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_events_resulting_opportunity_id_fkey"
            columns: ["resulting_opportunity_id"]
            isOneToOne: false
            referencedRelation: "vw_intel_won_vs_lost_30d"
            referencedColumns: ["opportunity_id"]
          },
        ]
      }
      integration_inbound_handlers: {
        Row: {
          created_at: string
          description: string | null
          event_type: string
          event_version: number
          handler_key: string
          id: string
          integration_slug: string
          is_active: boolean
          max_attempts: number
          requires_ordering: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type: string
          event_version?: number
          handler_key: string
          id?: string
          integration_slug: string
          is_active?: boolean
          max_attempts?: number
          requires_ordering?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string
          event_version?: number
          handler_key?: string
          id?: string
          integration_slug?: string
          is_active?: boolean
          max_attempts?: number
          requires_ordering?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      integration_inbound_ingest_errors: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          event_type: string | null
          external_id: string | null
          id: string
          integration_slug: string
          organization_id: string | null
          trace_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          integration_slug: string
          organization_id?: string | null
          trace_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          integration_slug?: string
          organization_id?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      integration_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          event_id: string
          external_response: Json | null
          id: string
          idempotency_key: string
          integration_slug: string
          last_error: string | null
          last_error_at: string | null
          max_attempts: number
          next_run_at: string
          organization_id: string
          payload: Json
          started_at: string | null
          status: string
          subscription_id: string
          target_action: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          event_id: string
          external_response?: Json | null
          id?: string
          idempotency_key: string
          integration_slug: string
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number
          next_run_at?: string
          organization_id: string
          payload: Json
          started_at?: string | null
          status?: string
          subscription_id: string
          target_action: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          event_id?: string
          external_response?: Json | null
          id?: string
          idempotency_key?: string
          integration_slug?: string
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number
          next_run_at?: string
          organization_id?: string
          payload?: Json
          started_at?: string | null
          status?: string
          subscription_id?: string
          target_action?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "integration_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_jobs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "integration_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_subscriptions: {
        Row: {
          config: Json
          created_at: string
          event_type: string
          id: string
          integration_slug: string
          is_active: boolean
          organization_id: string
          paused_until: string | null
          target_action: string
        }
        Insert: {
          config?: Json
          created_at?: string
          event_type: string
          id?: string
          integration_slug: string
          is_active?: boolean
          organization_id: string
          paused_until?: string | null
          target_action: string
        }
        Update: {
          config?: Json
          created_at?: string
          event_type?: string
          id?: string
          integration_slug?: string
          is_active?: boolean
          organization_id?: string
          paused_until?: string | null
          target_action?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_subscriptions_organization_id_fkey"
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
      intelligence_backfill_runs: {
        Row: {
          created_at: string
          created_by: string | null
          cursor_ts: string
          enqueued_audio: number
          enqueued_text: number
          from_ts: string
          id: string
          last_error: string | null
          max_cost_usd: number
          mode: string
          organization_id: string
          slice_hours: number
          status: string
          to_ts: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cursor_ts: string
          enqueued_audio?: number
          enqueued_text?: number
          from_ts: string
          id?: string
          last_error?: string | null
          max_cost_usd?: number
          mode?: string
          organization_id: string
          slice_hours?: number
          status?: string
          to_ts: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cursor_ts?: string
          enqueued_audio?: number
          enqueued_text?: number
          from_ts?: string
          id?: string
          last_error?: string | null
          max_cost_usd?: number
          mode?: string
          organization_id?: string
          slice_hours?: number
          status?: string
          to_ts?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_backfill_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          external_response: Json | null
          id: string
          idempotency_key: string
          last_error: string | null
          last_error_at: string | null
          last_reclaim_at: string | null
          last_reclaim_reason: string | null
          max_attempts: number
          next_run_at: string
          organization_id: string
          payload: Json
          reclaim_count: number
          started_at: string | null
          status: string
          target_action: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          external_response?: Json | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          last_error_at?: string | null
          last_reclaim_at?: string | null
          last_reclaim_reason?: string | null
          max_attempts?: number
          next_run_at?: string
          organization_id: string
          payload?: Json
          reclaim_count?: number
          started_at?: string | null
          status?: string
          target_action: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          external_response?: Json | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          last_error_at?: string | null
          last_reclaim_at?: string | null
          last_reclaim_reason?: string | null
          max_attempts?: number
          next_run_at?: string
          organization_id?: string
          payload?: Json
          reclaim_count?: number
          started_at?: string | null
          status?: string
          target_action?: string
        }
        Relationships: []
      }
      intelligence_settings: {
        Row: {
          behavior: Json
          capture: Json
          created_at: string
          organization_id: string
          privacy: Json
          transcription: Json
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          behavior?: Json
          capture?: Json
          created_at?: string
          organization_id: string
          privacy?: Json
          transcription?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          behavior?: Json
          capture?: Json
          created_at?: string
          organization_id?: string
          privacy?: Json
          transcription?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_settings_audit: {
        Row: {
          after: Json | null
          before: Json | null
          changed_by: string | null
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          after?: Json | null
          before?: Json | null
          changed_by?: string | null
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          after?: Json | null
          before?: Json | null
          changed_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_settings_audit_organization_id_fkey"
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
      kommo_user_mappings: {
        Row: {
          created_at: string | null
          id: string
          kommo_user_email: string | null
          kommo_user_id: number
          kommo_user_name: string | null
          organization_id: string
          seialz_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kommo_user_email?: string | null
          kommo_user_id: number
          kommo_user_name?: string | null
          organization_id: string
          seialz_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kommo_user_email?: string | null
          kommo_user_id?: number
          kommo_user_name?: string | null
          organization_id?: string
          seialz_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kommo_user_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kommo_user_mappings_seialz_user_id_fkey"
            columns: ["seialz_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_form_questions: {
        Row: {
          configured_at: string | null
          configured_by_user_id: string | null
          created_at: string
          custom_field_definition_id: string | null
          field_key: string
          field_label: string
          field_options: Json | null
          field_order: number
          field_type: string
          fixed_tag_id: string | null
          id: string
          is_configured: boolean
          lead_form_id: string
          mapped_to_contact_field: string | null
          mapping_strategy: string
          organization_id: string
          tag_color: string | null
          tag_prefix: string | null
          tag_strategy: string | null
          target_entity: string
          updated_at: string
        }
        Insert: {
          configured_at?: string | null
          configured_by_user_id?: string | null
          created_at?: string
          custom_field_definition_id?: string | null
          field_key: string
          field_label: string
          field_options?: Json | null
          field_order?: number
          field_type: string
          fixed_tag_id?: string | null
          id?: string
          is_configured?: boolean
          lead_form_id: string
          mapped_to_contact_field?: string | null
          mapping_strategy?: string
          organization_id: string
          tag_color?: string | null
          tag_prefix?: string | null
          tag_strategy?: string | null
          target_entity?: string
          updated_at?: string
        }
        Update: {
          configured_at?: string | null
          configured_by_user_id?: string | null
          created_at?: string
          custom_field_definition_id?: string | null
          field_key?: string
          field_label?: string
          field_options?: Json | null
          field_order?: number
          field_type?: string
          fixed_tag_id?: string | null
          id?: string
          is_configured?: boolean
          lead_form_id?: string
          mapped_to_contact_field?: string | null
          mapping_strategy?: string
          organization_id?: string
          tag_color?: string | null
          tag_prefix?: string | null
          tag_strategy?: string | null
          target_entity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_form_questions_configured_by_user_id_fkey"
            columns: ["configured_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_form_questions_custom_field_definition_id_fkey"
            columns: ["custom_field_definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_form_questions_fixed_tag_id_fkey"
            columns: ["fixed_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_form_questions_lead_form_id_fkey"
            columns: ["lead_form_id"]
            isOneToOne: false
            referencedRelation: "lead_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_form_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_forms: {
        Row: {
          consecutive_errors: number
          created_at: string
          discovered_at: string
          id: string
          is_mapping_configured: boolean
          is_monitored: boolean
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          last_synced_lead_created_time: string | null
          last_synced_lead_id: string | null
          meta_lead_page_id: string | null
          organization_id: string
          organization_integration_id: string | null
          provider: string
          provider_form_id: string
          provider_form_name: string
          provider_metadata: Json
          questions_synced_at: string | null
          total_synced_leads: number
          updated_at: string
        }
        Insert: {
          consecutive_errors?: number
          created_at?: string
          discovered_at?: string
          id?: string
          is_mapping_configured?: boolean
          is_monitored?: boolean
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          last_synced_lead_created_time?: string | null
          last_synced_lead_id?: string | null
          meta_lead_page_id?: string | null
          organization_id: string
          organization_integration_id?: string | null
          provider: string
          provider_form_id: string
          provider_form_name: string
          provider_metadata?: Json
          questions_synced_at?: string | null
          total_synced_leads?: number
          updated_at?: string
        }
        Update: {
          consecutive_errors?: number
          created_at?: string
          discovered_at?: string
          id?: string
          is_mapping_configured?: boolean
          is_monitored?: boolean
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          last_synced_lead_created_time?: string | null
          last_synced_lead_id?: string | null
          meta_lead_page_id?: string | null
          organization_id?: string
          organization_integration_id?: string | null
          provider?: string
          provider_form_id?: string
          provider_form_name?: string
          provider_metadata?: Json
          questions_synced_at?: string | null
          total_synced_leads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_forms_meta_lead_page_id_fkey"
            columns: ["meta_lead_page_id"]
            isOneToOne: false
            referencedRelation: "meta_lead_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_forms_organization_integration_id_fkey"
            columns: ["organization_integration_id"]
            isOneToOne: false
            referencedRelation: "organization_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_attribution_ambiguities: {
        Row: {
          candidate_count: number
          candidate_ids: string[]
          contact_id: string
          created_at: string
          id: string
          match_kind: string
          organization_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          resolved_marketing_campaign_id: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          candidate_count: number
          candidate_ids: string[]
          contact_id: string
          created_at?: string
          id?: string
          match_kind: string
          organization_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_marketing_campaign_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          candidate_count?: number
          candidate_ids?: string[]
          contact_id?: string
          created_at?: string
          id?: string
          match_kind?: string
          organization_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_marketing_campaign_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_attribution_ambigui_resolved_marketing_campaign__fkey"
            columns: ["resolved_marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_ambigui_resolved_marketing_campaign__fkey"
            columns: ["resolved_marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_ad_performance"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "marketing_attribution_ambigui_resolved_marketing_campaign__fkey"
            columns: ["resolved_marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_funnel"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "marketing_attribution_ambiguities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_ambiguities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaign_insights_daily: {
        Row: {
          clicks: number
          conversations_started: number
          cpc_cents: number | null
          cpm_cents: number | null
          created_at: string
          ctr_basis_points: number | null
          date: string
          id: string
          impressions: number
          inline_link_clicks: number
          leads_attributed: number
          marketing_campaign_id: string
          organization_id: string
          reach: number
          source_data: Json | null
          spend_cents: number
          spend_currency: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          conversations_started?: number
          cpc_cents?: number | null
          cpm_cents?: number | null
          created_at?: string
          ctr_basis_points?: number | null
          date: string
          id?: string
          impressions?: number
          inline_link_clicks?: number
          leads_attributed?: number
          marketing_campaign_id: string
          organization_id: string
          reach?: number
          source_data?: Json | null
          spend_cents?: number
          spend_currency?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          conversations_started?: number
          cpc_cents?: number | null
          cpm_cents?: number | null
          created_at?: string
          ctr_basis_points?: number | null
          date?: string
          id?: string
          impressions?: number
          inline_link_clicks?: number
          leads_attributed?: number
          marketing_campaign_id?: string
          organization_id?: string
          reach?: number
          source_data?: Json | null
          spend_cents?: number
          spend_currency?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_insights_daily_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_insights_daily_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_ad_performance"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "marketing_campaign_insights_daily_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_funnel"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "marketing_campaign_insights_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaign_spend_history: {
        Row: {
          clicks: number | null
          created_at: string
          id: string
          impressions: number | null
          leads_attributed: number | null
          marketing_campaign_id: string
          organization_id: string
          spend_cents: number
          spend_currency: string
          synced_at: string
          updated_at: string
          year_month: string
        }
        Insert: {
          clicks?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          leads_attributed?: number | null
          marketing_campaign_id: string
          organization_id: string
          spend_cents?: number
          spend_currency?: string
          synced_at?: string
          updated_at?: string
          year_month: string
        }
        Update: {
          clicks?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          leads_attributed?: number | null
          marketing_campaign_id?: string
          organization_id?: string
          spend_cents?: number
          spend_currency?: string
          synced_at?: string
          updated_at?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_spend_history_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_spend_history_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_ad_performance"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "marketing_campaign_spend_history_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_funnel"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "marketing_campaign_spend_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_objective: string | null
          channel: string
          clicks: number | null
          created_at: string
          creative_body: string | null
          creative_headline: string | null
          creative_id: string | null
          creative_name: string | null
          creative_thumbnail_url: string | null
          deleted_at: string | null
          destination_url: string | null
          display_hierarchy: string | null
          display_name: string | null
          external_id: string
          id: string
          impressions: number | null
          last_synced_at: string | null
          metrics_synced_at: string | null
          organization_id: string
          platform: string
          platform_data: Json | null
          spend_currency: string | null
          spend_total_cents: number | null
          status: string | null
          sync_error: string | null
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          campaign_objective?: string | null
          channel: string
          clicks?: number | null
          created_at?: string
          creative_body?: string | null
          creative_headline?: string | null
          creative_id?: string | null
          creative_name?: string | null
          creative_thumbnail_url?: string | null
          deleted_at?: string | null
          destination_url?: string | null
          display_hierarchy?: string | null
          display_name?: string | null
          external_id: string
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          metrics_synced_at?: string | null
          organization_id: string
          platform: string
          platform_data?: Json | null
          spend_currency?: string | null
          spend_total_cents?: number | null
          status?: string | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          campaign_objective?: string | null
          channel?: string
          clicks?: number | null
          created_at?: string
          creative_body?: string | null
          creative_headline?: string | null
          creative_id?: string | null
          creative_name?: string | null
          creative_thumbnail_url?: string | null
          deleted_at?: string | null
          destination_url?: string | null
          display_hierarchy?: string | null
          display_name?: string | null
          external_id?: string
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          metrics_synced_at?: string | null
          organization_id?: string
          platform?: string
          platform_data?: Json | null
          spend_currency?: string | null
          spend_total_cents?: number | null
          status?: string | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_analyses: {
        Row: {
          analysis_version: string
          buying_signals: Json
          confidence: string | null
          conversation_stage: string | null
          created_at: string
          id: string
          intent: string | null
          is_template: boolean | null
          language_complexity: string | null
          message_id: string
          message_quality_score: number | null
          model: string
          objection_type: string | null
          organization_id: string
          raw_response: Json | null
          reasoning: string | null
          requires_human: boolean
          sentiment: string | null
          speaker_role: string | null
          tokens_used: number | null
          urgency_score: number | null
        }
        Insert: {
          analysis_version: string
          buying_signals?: Json
          confidence?: string | null
          conversation_stage?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          is_template?: boolean | null
          language_complexity?: string | null
          message_id: string
          message_quality_score?: number | null
          model: string
          objection_type?: string | null
          organization_id: string
          raw_response?: Json | null
          reasoning?: string | null
          requires_human?: boolean
          sentiment?: string | null
          speaker_role?: string | null
          tokens_used?: number | null
          urgency_score?: number | null
        }
        Update: {
          analysis_version?: string
          buying_signals?: Json
          confidence?: string | null
          conversation_stage?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          is_template?: boolean | null
          language_complexity?: string | null
          message_id?: string
          message_quality_score?: number | null
          model?: string
          objection_type?: string | null
          organization_id?: string
          raw_response?: Json | null
          reasoning?: string | null
          requires_human?: boolean
          sentiment?: string | null
          speaker_role?: string | null
          tokens_used?: number | null
          urgency_score?: number | null
        }
        Relationships: []
      }
      message_response_times: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          inbound_at: string
          inbound_message_id: string
          opportunity_id: string | null
          organization_id: string
          outbound_at: string
          outbound_message_id: string
          response_seconds: number
          thread_id: string
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          inbound_at: string
          inbound_message_id: string
          opportunity_id?: string | null
          organization_id: string
          outbound_at: string
          outbound_message_id: string
          response_seconds: number
          thread_id: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          inbound_at?: string
          inbound_message_id?: string
          opportunity_id?: string | null
          organization_id?: string
          outbound_at?: string
          outbound_message_id?: string
          response_seconds?: number
          thread_id?: string
          user_id?: string | null
        }
        Relationships: []
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
          category_id: string | null
          channel: string | null
          contact_id: string
          created_at: string | null
          external_id: string | null
          first_human_response_at: string | null
          first_response_at: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_direction: string | null
          last_message_id: string | null
          last_routing_decision: Json | null
          needs_human_attention: boolean | null
          opportunity_id: string | null
          organization_id: string
          original_owner_user_id: string | null
          primary_endpoint_id: string | null
          priority: string
          resolved_at: string | null
          sla_first_response_target_at: string | null
          sla_resolution_target_at: string | null
          status: string
          subject: string | null
          updated_at: string | null
          waiting_started_at: string | null
          whatsapp_last_inbound_at: string | null
        }
        Insert: {
          agent_typing?: boolean | null
          agent_typing_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          awaiting_button_response?: boolean | null
          button_options?: Json | null
          category_id?: string | null
          channel?: string | null
          contact_id: string
          created_at?: string | null
          external_id?: string | null
          first_human_response_at?: string | null
          first_response_at?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_direction?: string | null
          last_message_id?: string | null
          last_routing_decision?: Json | null
          needs_human_attention?: boolean | null
          opportunity_id?: string | null
          organization_id: string
          original_owner_user_id?: string | null
          primary_endpoint_id?: string | null
          priority?: string
          resolved_at?: string | null
          sla_first_response_target_at?: string | null
          sla_resolution_target_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string | null
          waiting_started_at?: string | null
          whatsapp_last_inbound_at?: string | null
        }
        Update: {
          agent_typing?: boolean | null
          agent_typing_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          awaiting_button_response?: boolean | null
          button_options?: Json | null
          category_id?: string | null
          channel?: string | null
          contact_id?: string
          created_at?: string | null
          external_id?: string | null
          first_human_response_at?: string | null
          first_response_at?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_direction?: string | null
          last_message_id?: string | null
          last_routing_decision?: Json | null
          needs_human_attention?: boolean | null
          opportunity_id?: string | null
          organization_id?: string
          original_owner_user_id?: string | null
          primary_endpoint_id?: string | null
          priority?: string
          resolved_at?: string | null
          sla_first_response_target_at?: string | null
          sla_resolution_target_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string | null
          waiting_started_at?: string | null
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
            foreignKeyName: "message_threads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_categories"
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
            foreignKeyName: "message_threads_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "vw_intel_won_vs_lost_30d"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "message_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_original_owner_user_id_fkey"
            columns: ["original_owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_primary_endpoint_id_fkey"
            columns: ["primary_endpoint_id"]
            isOneToOne: false
            referencedRelation: "communication_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_analysis_version: string | null
          ai_analyzed_at: string | null
          ai_processed: boolean | null
          content: string
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          endpoint_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          intent: string | null
          is_internal_note: boolean
          is_sample: boolean | null
          media_type: string | null
          media_urls: Json | null
          metadata: Json | null
          organization_id: string
          reply_to_message_id: string | null
          response_time_seconds: number | null
          sender_agent_id: string | null
          sender_name: string | null
          sender_type: string | null
          sender_user_id: string | null
          sent_at: string | null
          sentiment: string | null
          template_id: string | null
          thread_id: string
          urgency_score: number | null
          whatsapp_message_sid: string | null
          whatsapp_status: string | null
        }
        Insert: {
          ai_analysis_version?: string | null
          ai_analyzed_at?: string | null
          ai_processed?: boolean | null
          content: string
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          endpoint_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          intent?: string | null
          is_internal_note?: boolean
          is_sample?: boolean | null
          media_type?: string | null
          media_urls?: Json | null
          metadata?: Json | null
          organization_id: string
          reply_to_message_id?: string | null
          response_time_seconds?: number | null
          sender_agent_id?: string | null
          sender_name?: string | null
          sender_type?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          sentiment?: string | null
          template_id?: string | null
          thread_id: string
          urgency_score?: number | null
          whatsapp_message_sid?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          ai_analysis_version?: string | null
          ai_analyzed_at?: string | null
          ai_processed?: boolean | null
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          endpoint_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          intent?: string | null
          is_internal_note?: boolean
          is_sample?: boolean | null
          media_type?: string | null
          media_urls?: Json | null
          metadata?: Json | null
          organization_id?: string
          reply_to_message_id?: string | null
          response_time_seconds?: number | null
          sender_agent_id?: string | null
          sender_name?: string | null
          sender_type?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          sentiment?: string | null
          template_id?: string | null
          thread_id?: string
          urgency_score?: number | null
          whatsapp_message_sid?: string | null
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "communication_endpoints"
            referencedColumns: ["id"]
          },
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
      meta_lead_pages: {
        Row: {
          created_at: string
          discovered_at: string
          id: string
          is_active: boolean
          last_health_check_at: string | null
          last_health_check_error: string | null
          last_health_check_status: string | null
          meta_business_id: string | null
          meta_page_category: string | null
          meta_page_id: string
          meta_page_name: string
          organization_id: string
          organization_integration_id: string
          page_access_token_encrypted: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discovered_at?: string
          id?: string
          is_active?: boolean
          last_health_check_at?: string | null
          last_health_check_error?: string | null
          last_health_check_status?: string | null
          meta_business_id?: string | null
          meta_page_category?: string | null
          meta_page_id: string
          meta_page_name: string
          organization_id: string
          organization_integration_id: string
          page_access_token_encrypted: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discovered_at?: string
          id?: string
          is_active?: boolean
          last_health_check_at?: string | null
          last_health_check_error?: string | null
          last_health_check_status?: string | null
          meta_business_id?: string | null
          meta_page_category?: string | null
          meta_page_id?: string
          meta_page_name?: string
          organization_id?: string
          organization_integration_id?: string
          page_access_token_encrypted?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_pages_organization_integration_id_fkey"
            columns: ["organization_integration_id"]
            isOneToOne: false
            referencedRelation: "organization_integrations"
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
          attribution_data: Json | null
          attribution_locked_at: string | null
          close_date: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          ghosting_risk_score: number | null
          health_score: number | null
          id: string
          is_sample: boolean | null
          marketing_campaign_id: string | null
          organization_id: string
          owner_user_id: string | null
          pipeline_stage_id: string
          source: string | null
          source_external_id: string | null
          status: Database["public"]["Enums"]["opportunity_status"] | null
          title: string
          updated_at: string | null
          updated_by: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          amount?: number | null
          attribution_data?: Json | null
          attribution_locked_at?: string | null
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          ghosting_risk_score?: number | null
          health_score?: number | null
          id?: string
          is_sample?: boolean | null
          marketing_campaign_id?: string | null
          organization_id: string
          owner_user_id?: string | null
          pipeline_stage_id: string
          source?: string | null
          source_external_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          amount?: number | null
          attribution_data?: Json | null
          attribution_locked_at?: string | null
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          ghosting_risk_score?: number | null
          health_score?: number | null
          id?: string
          is_sample?: boolean | null
          marketing_campaign_id?: string | null
          organization_id?: string
          owner_user_id?: string | null
          pipeline_stage_id?: string
          source?: string | null
          source_external_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
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
            foreignKeyName: "opportunities_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_ad_performance"
            referencedColumns: ["marketing_campaign_id"]
          },
          {
            foreignKeyName: "opportunities_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_marketing_funnel"
            referencedColumns: ["marketing_campaign_id"]
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
      opportunities_status_backup_20260512: {
        Row: {
          backed_up_at: string | null
          close_date: string | null
          id: string | null
          organization_id: string | null
          pipeline_stage_id: string | null
          status: Database["public"]["Enums"]["opportunity_status"] | null
        }
        Insert: {
          backed_up_at?: string | null
          close_date?: string | null
          id?: string | null
          organization_id?: string | null
          pipeline_stage_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
        }
        Update: {
          backed_up_at?: string | null
          close_date?: string | null
          id?: string | null
          organization_id?: string | null
          pipeline_stage_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
        }
        Relationships: []
      }
      opportunity_behavior_snapshot: {
        Row: {
          asked_deadline: boolean
          asked_price: boolean
          audios_inbound: number
          audios_outbound: number
          avg_lead_response_seconds: number | null
          avg_seller_response_seconds: number | null
          buying_signals_count: number
          contact_id: string | null
          days_to_close: number | null
          days_to_ghost: number | null
          documents_sent: number
          final_status: string | null
          first_response_seconds: number | null
          ghosted_after_stage: string | null
          hours_distribution: Json
          last_inbound_at: string | null
          last_outbound_at: string | null
          lost_at: string | null
          lost_reason: string | null
          objections_count: number
          opportunity_id: string
          organization_id: string
          sent_documents: boolean
          total_messages_inbound: number
          total_messages_outbound: number
          updated_at: string
          user_id: string | null
          won_at: string | null
        }
        Insert: {
          asked_deadline?: boolean
          asked_price?: boolean
          audios_inbound?: number
          audios_outbound?: number
          avg_lead_response_seconds?: number | null
          avg_seller_response_seconds?: number | null
          buying_signals_count?: number
          contact_id?: string | null
          days_to_close?: number | null
          days_to_ghost?: number | null
          documents_sent?: number
          final_status?: string | null
          first_response_seconds?: number | null
          ghosted_after_stage?: string | null
          hours_distribution?: Json
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          objections_count?: number
          opportunity_id: string
          organization_id: string
          sent_documents?: boolean
          total_messages_inbound?: number
          total_messages_outbound?: number
          updated_at?: string
          user_id?: string | null
          won_at?: string | null
        }
        Update: {
          asked_deadline?: boolean
          asked_price?: boolean
          audios_inbound?: number
          audios_outbound?: number
          avg_lead_response_seconds?: number | null
          avg_seller_response_seconds?: number | null
          buying_signals_count?: number
          contact_id?: string | null
          days_to_close?: number | null
          days_to_ghost?: number | null
          documents_sent?: number
          final_status?: string | null
          first_response_seconds?: number | null
          ghosted_after_stage?: string | null
          hours_distribution?: Json
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          objections_count?: number
          opportunity_id?: string
          organization_id?: string
          sent_documents?: boolean
          total_messages_inbound?: number
          total_messages_outbound?: number
          updated_at?: string
          user_id?: string | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_behavior_snapshot_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_behavior_snapshot_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "vw_intel_won_vs_lost_30d"
            referencedColumns: ["opportunity_id"]
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
          secret_payload: Json | null
          updated_at: string | null
          whatsapp_inbound_settings: Json | null
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
          secret_payload?: Json | null
          updated_at?: string | null
          whatsapp_inbound_settings?: Json | null
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
          secret_payload?: Json | null
          updated_at?: string | null
          whatsapp_inbound_settings?: Json | null
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
          cs_inbox_includes_service_endpoints: boolean
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
          private_records_enabled: boolean
          round_robin_enabled: boolean
          round_robin_scope: string
          slug: string
          suspended_at: string | null
          suspended_by_admin_id: string | null
          suspended_reason: string | null
          theme_dark_mode: boolean | null
          theme_preset: string | null
          theme_primary_color: string | null
          theme_sidebar_color: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cs_inbox_includes_service_endpoints?: boolean
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
          private_records_enabled?: boolean
          round_robin_enabled?: boolean
          round_robin_scope?: string
          slug: string
          suspended_at?: string | null
          suspended_by_admin_id?: string | null
          suspended_reason?: string | null
          theme_dark_mode?: boolean | null
          theme_preset?: string | null
          theme_primary_color?: string | null
          theme_sidebar_color?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cs_inbox_includes_service_endpoints?: boolean
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
          private_records_enabled?: boolean
          round_robin_enabled?: boolean
          round_robin_scope?: string
          slug?: string
          suspended_at?: string | null
          suspended_by_admin_id?: string | null
          suspended_reason?: string | null
          theme_dark_mode?: boolean | null
          theme_preset?: string | null
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
      outbox_system_heartbeats: {
        Row: {
          component: string
          last_detail: Json | null
          last_run_at: string
        }
        Insert: {
          component: string
          last_detail?: Json | null
          last_run_at?: string
        }
        Update: {
          component?: string
          last_detail?: Json | null
          last_run_at?: string
        }
        Relationships: []
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
      provider_pricing: {
        Row: {
          audio_per_minute_usd: number | null
          created_at: string
          effective_from: string
          id: string
          input_per_1k_usd: number | null
          model: string
          output_per_1k_usd: number | null
          provider: string
        }
        Insert: {
          audio_per_minute_usd?: number | null
          created_at?: string
          effective_from?: string
          id?: string
          input_per_1k_usd?: number | null
          model: string
          output_per_1k_usd?: number | null
          provider: string
        }
        Update: {
          audio_per_minute_usd?: number | null
          created_at?: string
          effective_from?: string
          id?: string
          input_per_1k_usd?: number | null
          model?: string
          output_per_1k_usd?: number | null
          provider?: string
        }
        Relationships: []
      }
      sales_events: {
        Row: {
          contact_id: string | null
          created_at: string
          event_type: string
          id: string
          message_id: string | null
          occurred_at: string
          opportunity_id: string | null
          organization_id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message_id?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          organization_id: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message_id?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          organization_id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
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
      seller_metrics_daily: {
        Row: {
          audios_received: number
          audios_sent: number
          avg_days_before_lost: number | null
          avg_messages_per_lost: number | null
          avg_response_seconds: number | null
          day: string
          follow_ups_count: number
          hot_leads_abandoned: number
          leads_lost: number
          leads_touched: number
          leads_won: number
          median_response_seconds: number | null
          messages_received: number
          messages_sent: number
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audios_received?: number
          audios_sent?: number
          avg_days_before_lost?: number | null
          avg_messages_per_lost?: number | null
          avg_response_seconds?: number | null
          day: string
          follow_ups_count?: number
          hot_leads_abandoned?: number
          leads_lost?: number
          leads_touched?: number
          leads_won?: number
          median_response_seconds?: number | null
          messages_received?: number
          messages_sent?: number
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audios_received?: number
          audios_sent?: number
          avg_days_before_lost?: number | null
          avg_messages_per_lost?: number | null
          avg_response_seconds?: number | null
          day?: string
          follow_ups_count?: number
          hot_leads_abandoned?: number
          leads_lost?: number
          leads_touched?: number
          leads_won?: number
          median_response_seconds?: number | null
          messages_received?: number
          messages_sent?: number
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      support_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sla_configs: {
        Row: {
          business_hours_only: boolean
          category_id: string | null
          created_at: string
          first_response_minutes: number
          id: string
          is_active: boolean
          organization_id: string
          priority: string
          resolution_minutes: number
          updated_at: string
        }
        Insert: {
          business_hours_only?: boolean
          category_id?: string | null
          created_at?: string
          first_response_minutes?: number
          id?: string
          is_active?: boolean
          organization_id: string
          priority?: string
          resolution_minutes?: number
          updated_at?: string
        }
        Update: {
          business_hours_only?: boolean
          category_id?: string | null
          created_at?: string
          first_response_minutes?: number
          id?: string
          is_active?: boolean
          organization_id?: string
          priority?: string
          resolution_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sla_configs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sla_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          completion_notes: string | null
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
          postpone_reason: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          requested_by_user_id: string | null
          resolution_text: string | null
          source_external_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_type: string | null
          thread_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_user_id: string
          completed_at?: string | null
          completion_notes?: string | null
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
          postpone_reason?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          requested_by_user_id?: string | null
          resolution_text?: string | null
          source_external_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: string | null
          thread_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string
          completed_at?: string | null
          completion_notes?: string | null
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
          postpone_reason?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          requested_by_user_id?: string | null
          resolution_text?: string | null
          source_external_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: string | null
          thread_id?: string | null
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
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "vw_intel_won_vs_lost_30d"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by_user_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          is_primary: boolean
          metadata: Json
          organization_id: string
          parent_id: string
          parent_type: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by_user_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          organization_id: string
          parent_id: string
          parent_type: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by_user_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          organization_id?: string
          parent_id?: string
          parent_type?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_assignment_history: {
        Row: {
          action_type: string
          created_at: string
          from_user_id: string | null
          id: string
          metadata: Json
          organization_id: string
          performed_by_user_id: string | null
          reason: string | null
          thread_id: string
          to_user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          performed_by_user_id?: string | null
          reason?: string | null
          thread_id: string
          to_user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          performed_by_user_id?: string | null
          reason?: string | null
          thread_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thread_assignment_history_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_assignment_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_assignment_history_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_assignment_history_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_assignment_history_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_routing_rules: {
        Row: {
          action: Json
          condition: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          priority: number
          updated_at: string
        }
        Insert: {
          action?: Json
          condition?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          priority?: number
          updated_at?: string
        }
        Update: {
          action?: Json
          condition?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_routing_rules_organization_id_fkey"
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
          last_assigned_at: string | null
          organization_id: string
          permission_profile_id: string
          round_robin_active: boolean
          round_robin_queues: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_assigned_at?: string | null
          organization_id: string
          permission_profile_id: string
          round_robin_active?: boolean
          round_robin_queues?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_assigned_at?: string | null
          organization_id?: string
          permission_profile_id?: string
          round_robin_active?: boolean
          round_robin_queues?: string[]
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
      webhook_field_mappings: {
        Row: {
          created_at: string | null
          default_value: string | null
          direction: string
          entity_type: string
          external_field: string
          id: string
          internal_field: string
          is_required: boolean | null
          organization_id: string
          transform_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          direction?: string
          entity_type?: string
          external_field: string
          id?: string
          internal_field: string
          is_required?: boolean | null
          organization_id: string
          transform_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          direction?: string
          entity_type?: string
          external_field?: string
          id?: string
          internal_field?: string
          is_required?: boolean | null
          organization_id?: string
          transform_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_field_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          components: Json | null
          created_at: string | null
          footer: string | null
          friendly_name: string
          header: string | null
          id: string
          is_active: boolean | null
          language: string | null
          last_synced_at: string | null
          meta_template_name: string | null
          meta_waba_id: string | null
          metadata: Json | null
          organization_id: string
          organization_integration_id: string | null
          provider: string
          rejection_reason: string | null
          source: string | null
          status: string | null
          template_type: string | null
          twilio_content_sid: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body: string
          category?: string | null
          components?: Json | null
          created_at?: string | null
          footer?: string | null
          friendly_name: string
          header?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          last_synced_at?: string | null
          meta_template_name?: string | null
          meta_waba_id?: string | null
          metadata?: Json | null
          organization_id: string
          organization_integration_id?: string | null
          provider?: string
          rejection_reason?: string | null
          source?: string | null
          status?: string | null
          template_type?: string | null
          twilio_content_sid?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body?: string
          category?: string | null
          components?: Json | null
          created_at?: string | null
          footer?: string | null
          friendly_name?: string
          header?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          last_synced_at?: string | null
          meta_template_name?: string | null
          meta_waba_id?: string | null
          metadata?: Json | null
          organization_id?: string
          organization_integration_id?: string | null
          provider?: string
          rejection_reason?: string | null
          source?: string | null
          status?: string | null
          template_type?: string | null
          twilio_content_sid?: string | null
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
          {
            foreignKeyName: "whatsapp_templates_organization_integration_id_fkey"
            columns: ["organization_integration_id"]
            isOneToOne: false
            referencedRelation: "organization_integrations"
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
      intelligence_stale_claims_metrics: {
        Row: {
          ever_reclaimed: number | null
          hot_reclaimed: number | null
          last_reclaim_at: string | null
          organization_id: string | null
          stale_running_30m: number | null
          stale_running_5m: number | null
          target_action: string | null
          total_running: number | null
        }
        Relationships: []
      }
      v_entity_sync_status: {
        Row: {
          entity_type: string | null
          internal_id: string | null
          last_synced_at: string | null
          organization_id: string | null
          worst_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_intel_sellers_30d: {
        Row: {
          avg_audios_outbound_per_deal: number | null
          avg_buying_signals_per_deal: number | null
          avg_cycle_hours: number | null
          avg_first_response_seconds: number | null
          avg_msgs_outbound_per_deal: number | null
          avg_objections_per_deal: number | null
          deals_closed: number | null
          deals_lost: number | null
          deals_won: number | null
          organization_id: string | null
          owner_user_id: string | null
          win_rate: number | null
        }
        Relationships: [
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
        ]
      }
      vw_intel_won_vs_lost_30d: {
        Row: {
          audios_inbound: number | null
          audios_outbound: number | null
          avg_lead_response_seconds: number | null
          avg_seller_response_seconds: number | null
          avg_urgency_score: number | null
          buying_signals_count: number | null
          closed_at: string | null
          cycle_hours: number | null
          days_to_close: number | null
          dominant_sentiment: string | null
          first_response_seconds: number | null
          human_handoff_count: number | null
          negative_sentiment_count: number | null
          objections_count: number | null
          opp_created_at: string | null
          opportunity_id: string | null
          organization_id: string | null
          owner_user_id: string | null
          status: Database["public"]["Enums"]["opportunity_status"] | null
          total_messages_inbound: number | null
          total_messages_outbound: number | null
        }
        Relationships: [
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
        ]
      }
      vw_marketing_ad_performance: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          ad_status: string | null
          adset_id: string | null
          adset_name: string | null
          cac_brl: number | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_objective: string | null
          channel: string | null
          clicks: number | null
          conversations_started: number | null
          cpc_brl: number | null
          cpl_real_brl: number | null
          cpm_brl: number | null
          created_at: string | null
          creative_body: string | null
          creative_headline: string | null
          creative_thumbnail_url: string | null
          ctr_basis_points: number | null
          destination_url: string | null
          first_lead_at: string | null
          impressions: number | null
          last_insight_date: string | null
          last_lead_at: string | null
          lead_to_opp_pct: number | null
          leads_total: number | null
          leads_with_email: number | null
          marketing_campaign_id: string | null
          metrics_synced_at: string | null
          opp_to_won_pct: number | null
          opps_lost: number | null
          opps_open: number | null
          opps_total: number | null
          opps_won: number | null
          organization_id: string | null
          pipeline_value_brl: number | null
          platform: string | null
          revenue_won_brl: number | null
          roas: number | null
          spend_brl: number | null
          spend_cents: number | null
          sync_status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_marketing_campaign_summary: {
        Row: {
          ads_active: number | null
          ads_count: number | null
          cac_brl: number | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_objective: string | null
          clicks: number | null
          conversations_started: number | null
          cpc_brl: number | null
          cpl_real_brl: number | null
          ctr_basis_points: number | null
          impressions: number | null
          leads_total: number | null
          opps_lost: number | null
          opps_open: number | null
          opps_total: number | null
          opps_won: number | null
          organization_id: string | null
          pipeline_value_brl: number | null
          platform: string | null
          revenue_won_brl: number | null
          roas: number | null
          spend_brl: number | null
          spend_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_marketing_funnel: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_name: string | null
          campaign_name: string | null
          cvr_click_to_conv_bps: number | null
          cvr_click_to_lead_overall_bps: number | null
          cvr_conv_to_lead_bps: number | null
          cvr_imp_to_click_bps: number | null
          cvr_lead_to_opp_bps: number | null
          cvr_opp_to_won_bps: number | null
          marketing_campaign_id: string | null
          organization_id: string | null
          stage_1_impressions: number | null
          stage_2_clicks: number | null
          stage_3_conversations: number | null
          stage_4_leads: number | null
          stage_5_opps: number | null
          stage_6_won: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_org_monthly_cost_byok: {
        Row: {
          cost_usd: number | null
          month: string | null
          organization_id: string | null
          provider: string | null
          tokens: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_org_monthly_cost_managed: {
        Row: {
          cost_usd: number | null
          month: string | null
          organization_id: string | null
          provider: string | null
          tokens: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_org_provider_keys: {
        Row: {
          info: Json | null
          organization_id: string | null
          provider: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_list_pipeline_stages: {
        Args: { p_org_id: string }
        Returns: {
          id: string
          name: string
          order_index: number
          type: string
        }[]
      }
      assign_round_robin:
        | { Args: { _org_id: string }; Returns: string }
        | { Args: { _org_id: string; _queue: string }; Returns: string }
      can_manage_integrations_in_org: {
        Args: { _org_id: string }
        Returns: boolean
      }
      can_review_contact_documents: {
        Args: { _contact_id: string }
        Returns: boolean
      }
      count_custom_fields_for_org: {
        Args: { p_module?: string; p_organization_id: string }
        Returns: number
      }
      current_user_id: { Args: never; Returns: string }
      current_user_managed_org_ids: { Args: never; Returns: string[] }
      current_user_org_ids: { Args: never; Returns: string[] }
      fn_build_opportunity_won_payload: {
        Args: { _opportunity_id: string }
        Returns: Json
      }
      fn_capi_dispatch_event: {
        Args: {
          p_contact_id?: string
          p_event_name: string
          p_opportunity_id?: string
          p_organization_id: string
        }
        Returns: undefined
      }
      fn_feature_flag_enabled: {
        Args: { _flag_key: string; _organization_id?: string }
        Returns: boolean
      }
      fn_inbound_archive_dead_letter: {
        Args: { _event_id: string }
        Returns: undefined
      }
      fn_inbound_expire: { Args: { _ttl?: string }; Returns: number }
      fn_inbound_health_summary: {
        Args: { _window?: string }
        Returns: {
          avg_latency_sec: number
          count: number
          integration_slug: string
          p95_latency_sec: number
          status: string
        }[]
      }
      fn_inbound_reap_stuck: { Args: { _timeout?: string }; Returns: number }
      fn_inbound_replay: { Args: { _event_id: string }; Returns: undefined }
      fn_inbound_schedule_retry: {
        Args: { _classification?: string; _error: string; _event_id: string }
        Returns: undefined
      }
      fn_inbound_top_errors: {
        Args: { _limit?: number; _window?: string }
        Returns: {
          count: number
          error_code: string
          last_seen: string
          message: string
        }[]
      }
      fn_log_marketing_attribution_attempt: {
        Args: { _contact_id: string; _org_id: string }
        Returns: string
      }
      fn_marketing_attribution_dryrun: {
        Args: never
        Returns: {
          ambiguous: number
          eligible_contacts: number
          no_match: number
          organization_id: string
          organization_name: string
          unique_match: number
        }[]
      }
      fn_marketing_attribution_top_conflicts: {
        Args: { _limit?: number; _org_id?: string }
        Returns: {
          ad_names: string
          adset_names: string
          campaign_names: string
          candidate_count: number
          candidate_ids: string[]
          contacts: number
          organization_id: string
          utm_campaign: string
          utm_content: string
          utm_medium: string
          utm_term: string
        }[]
      }
      fn_outbox_dismiss_job: {
        Args: { p_job_id: string; p_reason: string }
        Returns: undefined
      }
      fn_outbox_dlq_by_integration: {
        Args: never
        Returns: {
          count: number
          integration_slug: string
          last_error: string
          last_error_at: string
          target_action: string
        }[]
      }
      fn_outbox_health_summary: { Args: never; Returns: Json }
      fn_outbox_health_summary_internal: { Args: never; Returns: Json }
      fn_outbox_pause_subscription: {
        Args: { p_id: string; p_until: string }
        Returns: undefined
      }
      fn_outbox_resume_subscription: {
        Args: { p_id: string }
        Returns: undefined
      }
      fn_outbox_retry_job: { Args: { p_job_id: string }; Returns: undefined }
      fn_outbox_top_errors: {
        Args: { _limit?: number; _window?: string }
        Returns: {
          count: number
          last_seen: string
          message: string
          sample_integration_slug: string
        }[]
      }
      fn_reap_stuck_jobs: {
        Args: { p_threshold_minutes?: number }
        Returns: number
      }
      fn_resolve_marketing_campaign_id: {
        Args: {
          _org_id: string
          _utm_campaign: string
          _utm_content: string
          _utm_medium: string
          _utm_source: string
          _utm_term: string
        }
        Returns: {
          campaign_id: string
          candidate_count: number
          candidate_ids: string[]
          match_kind: string
        }[]
      }
      fn_schedule_retry: {
        Args: { p_error: string; p_job_id: string }
        Returns: undefined
      }
      fn_sync_nammux_subscription: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      get_dashboard_stats: {
        Args: {
          p_days_ago?: number
          p_organization_id: string
          p_owner_user_id?: string
        }
        Returns: Json
      }
      get_default_queue_for_thread: {
        Args: { _thread_id: string }
        Returns: {
          queue: string
          suggested_user_id: string
        }[]
      }
      get_internal_function_auth_token: { Args: never; Returns: string }
      get_marketing_ad_performance: {
        Args: {
          p_campaign_id?: string
          p_from?: string
          p_limit?: number
          p_organization_id: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          ad_id: string
          ad_name: string
          ad_status: string
          adset_name: string
          cac_brl: number
          campaign_id: string
          campaign_name: string
          clicks: number
          conversations_started: number
          cpl_real_brl: number
          creative_body: string
          creative_headline: string
          creative_thumbnail_url: string
          ctr_basis_points: number
          destination_url: string
          first_lead_at: string
          impressions: number
          last_insight_date: string
          last_lead_at: string
          lead_to_opp_pct: number
          leads_total: number
          marketing_campaign_id: string
          opp_to_won_pct: number
          opps_lost: number
          opps_open: number
          opps_total: number
          opps_won: number
          organization_id: string
          pipeline_value_brl: number
          revenue_won_brl: number
          roas: number
          spend_brl: number
        }[]
      }
      get_meta_credentials: {
        Args: { p_org_id: string }
        Returns: {
          ad_account_id: string
          business_id: string
          feature_ads_manager_sync: boolean
          feature_capi_send_events: boolean
          feature_lead_ads_sync: boolean
          is_connected: boolean
          last_token_check_at: string
          last_token_check_error: string
          meta_user_id: string
          meta_user_name: string
          page_id: string
          pixel_id: string
          raw_config_values: Json
          raw_connected_account: Json
          send_lead_events: boolean
          send_purchase_events: boolean
          source: string
          system_user_token_encrypted: string
          whatsapp_business_account_id: string
        }[]
      }
      get_opportunities_by_stage:
        | {
            Args: { p_limit_per_stage?: number; p_organization_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_close_date_from?: string
              p_close_date_to?: string
              p_created_from?: string
              p_created_to?: string
              p_include_no_owner?: boolean
              p_limit_per_stage?: number
              p_max_amount?: number
              p_min_amount?: number
              p_no_close_date?: boolean
              p_organization_id: string
              p_owner_ids?: string[]
              p_stage_ids?: string[]
              p_tag_ids?: string[]
            }
            Returns: Json
          }
      get_opportunity_stage_counts: {
        Args: { org_id: string }
        Returns: {
          opportunity_count: number
          stage_id: string
          total_amount: number
        }[]
      }
      get_service_dashboard_stats: {
        Args: { p_from: string; p_org: string; p_owner?: string; p_to: string }
        Returns: {
          avg_first_response_seconds: number
          avg_response_seconds: number
          contacts_count: number
          resolved_count: number
          total_count: number
        }[]
      }
      get_service_worst_responses: {
        Args: {
          p_from: string
          p_kind?: string
          p_limit?: number
          p_org: string
          p_owner?: string
          p_to: string
        }
        Returns: {
          contact_id: string
          contact_name: string
          id: string
          inbound_at: string
          max_seconds: number
          median_seconds: number
          outbound_at: string
          p90_seconds: number
          response_seconds: number
          thread_id: string
          total_count: number
          user_id: string
          user_name: string
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
      has_org_role: {
        Args: { _org_id: string; _role: string; _user_id: string }
        Returns: boolean
      }
      intelligence_fire_all_now: { Args: never; Returns: Json }
      intelligence_reap_stale_jobs: {
        Args: { p_max_reclaims?: number; p_stale_minutes?: number }
        Returns: {
          killed: number
          reclaimed: number
        }[]
      }
      is_admin_user: { Args: never; Returns: boolean }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      kairos_db_stats: { Args: never; Returns: Json }
      normalize_phone_br: { Args: { phone_input: string }; Returns: string }
      populate_communication_endpoints_from_v2_senders: {
        Args: never
        Returns: {
          inserted: number
          scanned_integrations: number
          updated: number
        }[]
      }
      reassign_thread: {
        Args: { _reason?: string; _thread_id: string; _to_user_id: string }
        Returns: Json
      }
      record_failed_admin_login: {
        Args: { p_email: string; p_ip: string }
        Returns: undefined
      }
      recover_stale_job_items: {
        Args: { _job_id: string }
        Returns: {
          exhausted: number
          recovered: number
        }[]
      }
      reset_admin_login_attempts: {
        Args: { p_admin_id: string }
        Returns: undefined
      }
      resolve_communication_endpoint: {
        Args: { _address: string; _channel: string; _organization_id: string }
        Returns: string
      }
      rpc_claim_inbound_events: {
        Args: {
          _batch_size?: number
          _integration_slug?: string
          _worker_id?: string
        }
        Returns: {
          aggregate_id: string | null
          aggregate_type: string | null
          claimed_at: string | null
          claimed_by: string | null
          correlation_id: string | null
          dead_letter_reason: string | null
          error_classification: string | null
          event_version: number
          expires_at: string
          external_id: string | null
          handler_key: string | null
          headers: Json | null
          http_method: string | null
          id: string
          idempotency_key: string | null
          integration_slug: string
          last_attempt_at: string | null
          max_attempts: number
          next_run_at: string | null
          organization_id: string | null
          parse_attempts: number
          parser_function: string | null
          parser_version: number | null
          process_error: string | null
          process_status: string
          processed_at: string | null
          raw_headers: Json | null
          raw_payload: Json
          received_at: string
          replay_count: number
          request_path: string | null
          resulting_contact_id: string | null
          resulting_message_id: string | null
          resulting_opportunity_id: string | null
          retry_count: number
          sequence_number: number | null
          shadow_mode: boolean
          signature_algo: string | null
          signature_valid: boolean | null
          source_event: string
          source_ip: unknown
          trace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_inbound_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_claim_inbound_shadow_events: {
        Args: {
          _batch_size?: number
          _claim_ttl?: string
          _handler_key?: string
          _integration_slug?: string
          _worker_id?: string
        }
        Returns: {
          aggregate_id: string | null
          aggregate_type: string | null
          claimed_at: string | null
          claimed_by: string | null
          correlation_id: string | null
          dead_letter_reason: string | null
          error_classification: string | null
          event_version: number
          expires_at: string
          external_id: string | null
          handler_key: string | null
          headers: Json | null
          http_method: string | null
          id: string
          idempotency_key: string | null
          integration_slug: string
          last_attempt_at: string | null
          max_attempts: number
          next_run_at: string | null
          organization_id: string | null
          parse_attempts: number
          parser_function: string | null
          parser_version: number | null
          process_error: string | null
          process_status: string
          processed_at: string | null
          raw_headers: Json | null
          raw_payload: Json
          received_at: string
          replay_count: number
          request_path: string | null
          resulting_contact_id: string | null
          resulting_message_id: string | null
          resulting_opportunity_id: string | null
          retry_count: number
          sequence_number: number | null
          shadow_mode: boolean
          signature_algo: string | null
          signature_valid: boolean | null
          source_event: string
          source_ip: unknown
          trace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_inbound_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_claim_integration_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          event_id: string
          external_response: Json | null
          id: string
          idempotency_key: string
          integration_slug: string
          last_error: string | null
          last_error_at: string | null
          max_attempts: number
          next_run_at: string
          organization_id: string
          payload: Json
          started_at: string | null
          status: string
          subscription_id: string
          target_action: string
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_claim_intelligence_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          external_response: Json | null
          id: string
          idempotency_key: string
          last_error: string | null
          last_error_at: string | null
          last_reclaim_at: string | null
          last_reclaim_reason: string | null
          max_attempts: number
          next_run_at: string
          organization_id: string
          payload: Json
          reclaim_count: number
          started_at: string | null
          status: string
          target_action: string
        }[]
        SetofOptions: {
          from: "*"
          to: "intelligence_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_dismiss_integration_job: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      rpc_kommo_upsert_contact: {
        Args: { p_data: Json; p_existing_id: string }
        Returns: string
      }
      rpc_kommo_upsert_opportunity: {
        Args: { p_data: Json; p_existing_id: string }
        Returns: string
      }
      rpc_list_message_threads:
        | {
            Args: {
              p_assigned_user_id?: string
              p_channels?: string[]
              p_cursor_id?: string
              p_cursor_updated_at?: string
              p_limit?: number
              p_organization_id: string
              p_status?: string
              p_unassigned_only?: boolean
            }
            Returns: {
              agent_typing: boolean
              assigned_user_id: string
              assigned_user_name: string
              awaiting_button_response: boolean
              channel: string
              contact_id: string
              contact_name: string
              contact_phone: string
              created_at: string
              id: string
              is_unread: boolean
              last_inbound_at: string
              last_message_at: string
              last_message_content: string
              last_message_direction: string
              last_message_id: string
              needs_human_attention: boolean
              status: string
              subject: string
              updated_at: string
              whatsapp_last_inbound_at: string
            }[]
          }
        | {
            Args: {
              p_assigned_user_id?: string
              p_channels?: string[]
              p_cursor_id?: string
              p_cursor_updated_at?: string
              p_limit?: number
              p_organization_id: string
              p_search?: string
              p_status?: string
              p_unassigned_only?: boolean
            }
            Returns: {
              agent_typing: boolean
              assigned_user_id: string
              assigned_user_name: string
              awaiting_button_response: boolean
              channel: string
              contact_id: string
              contact_name: string
              contact_phone: string
              created_at: string
              id: string
              is_unread: boolean
              last_inbound_at: string
              last_message_at: string
              last_message_content: string
              last_message_direction: string
              last_message_id: string
              needs_human_attention: boolean
              status: string
              subject: string
              updated_at: string
              whatsapp_last_inbound_at: string
            }[]
          }
      rpc_resolve_integration_job_manually: {
        Args: { p_job_id: string; p_note: string }
        Returns: undefined
      }
      rpc_retry_integration_job: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      rpc_update_integration_job_payload: {
        Args: { p_job_id: string; p_payload: Json }
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
      take_over_thread: {
        Args: { _reason?: string; _thread_id: string }
        Returns: Json
      }
      trigger_intelligence_backfill: {
        Args: { payload: Json }
        Returns: number
      }
      try_lead_form_polling_lock: {
        Args: { p_lead_form_id: string }
        Returns: boolean
      }
      update_organization_usage_metrics: {
        Args: { org_id: string }
        Returns: undefined
      }
      user_can_view_all: {
        Args: { _entity: string; _org_id: string }
        Returns: boolean
      }
      user_has_cs_permission: {
        Args: { _org: string; _perm: string }
        Returns: boolean
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
