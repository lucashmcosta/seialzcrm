import { supabase } from './client';

// The telephony tables are now present in the generated Database type, so this
// is just a thin alias kept for backwards compatibility with existing imports.
export const telephonySupabase = supabase;
