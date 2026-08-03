import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Json } from './types';

interface TelephonyNumberRow {
  id: string;
  organization_id: string;
  phone_number: string;
  friendly_name: string | null;
  provider: string;
  number_type: 'company' | 'user';
  assigned_user_id: string | null;
  is_active: boolean;
  is_primary: boolean;
  is_default_outbound: boolean;
  recording_enabled: boolean;
  ring_strategy: string;
  ring_users: string[];
  ring_timeout_seconds: number;
  inbound_settings: Json;
  timezone: string | null;
  business_hours: Json;
  max_attempts: number;
  fallback_action: string;
  fallback_message: string;
  missed_call_owner_user_id: string | null;
  hold_message: string;
  provider_number_id: string | null;
  iso_country: string | null;
  number_kind: string | null;
  capabilities: Json;
  sync_status: string;
  last_synced_at: string | null;
  address_sid: string | null;
  regulatory_bundle_sid: string | null;
  created_at: string;
  updated_at: string;
}

interface NumberUserRow {
  id: string;
  organization_id: string;
  phone_number_id: string;
  user_id: string;
  can_receive_calls: boolean;
  can_originate_calls: boolean;
  priority: number;
  last_offered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserSettingsRow {
  organization_id: string;
  user_id: string;
  receive_calls_enabled: boolean;
  dnd_until: string | null;
  created_at: string;
  updated_at: string;
}

interface PresenceRow {
  organization_id: string;
  user_id: string;
  session_id: string;
  status: 'available' | 'dnd';
  active_call_id: string | null;
  last_seen_at: string;
  created_at: string;
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type TelephonyDatabase = {
  public: {
    Tables: {
      organization_phone_numbers: Table<TelephonyNumberRow>;
      organization_phone_number_users: Table<NumberUserRow>;
      telephony_user_settings: Table<UserSettingsRow>;
      telephony_presence: Table<PresenceRow>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// Temporary typed view over the additive V2 schema. This can be removed once
// the generated Database type is refreshed after the migration is applied.
export const telephonySupabase = supabase as unknown as SupabaseClient<TelephonyDatabase>;
