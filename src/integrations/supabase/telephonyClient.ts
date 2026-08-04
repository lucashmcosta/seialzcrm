import { supabase } from './client';

// The generated Database type now includes the telephony V2 tables
// (organization_phone_numbers, organization_phone_number_users,
// telephony_user_settings, telephony_presence, call_transfers), so the old
// local shim type is no longer needed. Kept as a named export so existing
// call sites continue to work.
export const telephonySupabase = supabase;
