import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sessionId } = await req.json();

    if (!sessionId) {
      throw new Error('sessionId é obrigatório');
    }

    // Calculate duration and update session
    const { data: session, error: fetchError } = await supabase
      .from('impersonation_sessions')
      .select('started_at')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      throw new Error('Sessão não encontrada');
    }

    const endedAt = new Date();
    const startedAt = new Date(session.started_at);
    const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

    // Update session with end time
    const { error: updateError } = await supabase
      .from('impersonation_sessions')
      .update({
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
        status: 'ended',
      })
      .eq('id', sessionId);

    if (updateError) {
      throw updateError;
    }

    console.log(`Impersonation session ${sessionId} ended after ${durationSeconds} seconds`);

    return new Response(
      JSON.stringify({
        success: true,
        duration_seconds: durationSeconds,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in admin-impersonate-end:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro desconhecido' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
