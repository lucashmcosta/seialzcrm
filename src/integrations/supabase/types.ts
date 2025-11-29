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
      contacts: {
        Row: {
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
          updated_at: string | null
        }
        Insert: {
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
          updated_at?: string | null
        }
        Update: {
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
          updated_at?: string | null
        }
        Relationships: [
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
      opportunities: {
        Row: {
          amount: number | null
          close_date: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          deleted_at: string | null
          id: string
          is_sample: boolean | null
          organization_id: string
          owner_user_id: string | null
          pipeline_stage_id: string
          status: Database["public"]["Enums"]["opportunity_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          close_date?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          id?: string
          is_sample?: boolean | null
          organization_id: string
          owner_user_id?: string | null
          pipeline_stage_id: string
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          close_date?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          id?: string
          is_sample?: boolean | null
          organization_id?: string
          owner_user_id?: string | null
          pipeline_stage_id?: string
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
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
          logo_url: string | null
          name: string
          onboarding_completed_at: string | null
          onboarding_step: Database["public"]["Enums"]["onboarding_step"] | null
          slug: string
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
          logo_url?: string | null
          name: string
          onboarding_completed_at?: string | null
          onboarding_step?:
            | Database["public"]["Enums"]["onboarding_step"]
            | null
          slug: string
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
          logo_url?: string | null
          name?: string
          onboarding_completed_at?: string | null
          onboarding_step?:
            | Database["public"]["Enums"]["onboarding_step"]
            | null
          slug?: string
          timezone?: string | null
          updated_at?: string | null
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
      subscriptions: {
        Row: {
          billing_period: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_free_plan: boolean | null
          max_seats: number | null
          organization_id: string
          plan_name: string | null
          price_per_seat: number | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          updated_at: string | null
        }
        Insert: {
          billing_period?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_free_plan?: boolean | null
          max_seats?: number | null
          organization_id: string
          plan_name?: string | null
          price_per_seat?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          updated_at?: string | null
        }
        Update: {
          billing_period?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_free_plan?: boolean | null
          max_seats?: number | null
          organization_id?: string
          plan_name?: string | null
          price_per_seat?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
