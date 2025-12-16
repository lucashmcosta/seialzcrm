import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create client with user's JWT for permission checking
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { email, full_name, password, permission_profile_id, organization_id } = await req.json();

    // Validate required fields
    if (!email || !full_name || !password || !permission_profile_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, full_name, password, permission_profile_id, organization_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get requester's user record
    const { data: requesterUser, error: requesterError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .single();

    if (requesterError || !requesterUser) {
      console.error('Requester user not found:', requesterError);
      return new Response(
        JSON.stringify({ error: 'Requester user not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if requester has permission in the organization
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('user_organizations')
      .select('id, permission_profile_id, permission_profiles(permissions)')
      .eq('user_id', requesterUser.id)
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .single();

    if (membershipError || !membership) {
      console.error('Membership not found:', membershipError);
      return new Response(
        JSON.stringify({ error: 'You do not have access to this organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check can_manage_users permission
    const permissions = (membership.permission_profiles as any)?.permissions || {};
    if (!permissions.can_manage_users) {
      return new Response(
        JSON.stringify({ error: 'You do not have permission to manage users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check subscription seat limit
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, max_seats')
      .eq('organization_id', organization_id)
      .single();

    if (subError) {
      console.error('Subscription not found:', subError);
      return new Response(
        JSON.stringify({ error: 'Subscription not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: usage } = await supabaseAdmin
      .from('subscription_usage')
      .select('current_seat_count')
      .eq('subscription_id', subscription.id)
      .single();

    const currentSeats = usage?.current_seat_count || 0;
    const maxSeats = subscription.max_seats || 0;

    if (currentSeats >= maxSeats) {
      return new Response(
        JSON.stringify({ error: 'Seat limit reached. Please upgrade your plan or deactivate an existing user.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (emailExists) {
      return new Response(
        JSON.stringify({ error: 'A user with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user in auth.users
    console.log('Creating auth user for:', email);
    const { data: newAuthUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
      }
    });

    if (createAuthError || !newAuthUser.user) {
      console.error('Error creating auth user:', createAuthError);
      return new Response(
        JSON.stringify({ error: createAuthError?.message || 'Failed to create user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Auth user created:', newAuthUser.user.id);

    // Check if user record was auto-created by database trigger
    // The handle_new_user trigger may have already created the user
    let newUser: { id: string } | null = null;
    
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_user_id', newAuthUser.user.id)
      .single();

    if (existingUser) {
      console.log('User record already exists (created by trigger):', existingUser.id);
      newUser = existingUser;
      
      // Update user with correct name if needed
      const nameParts = full_name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
      
      await supabaseAdmin
        .from('users')
        .update({ full_name, first_name: firstName, last_name: lastName })
        .eq('id', existingUser.id);
      
      // The trigger also creates an auto-org - we need to clean it up
      // Find the auto-created organization membership and delete it along with the org
      const { data: autoMembership } = await supabaseAdmin
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', existingUser.id)
        .single();
      
      if (autoMembership && autoMembership.organization_id !== organization_id) {
        const autoOrgId = autoMembership.organization_id;
        console.log('Cleaning up auto-created organization:', autoOrgId);
        
        // Delete in correct order to avoid FK violations
        await supabaseAdmin.from('subscription_usage').delete().eq('subscription_id', 
          supabaseAdmin.from('subscriptions').select('id').eq('organization_id', autoOrgId));
        await supabaseAdmin.from('subscriptions').delete().eq('organization_id', autoOrgId);
        await supabaseAdmin.from('pipeline_stages').delete().eq('organization_id', autoOrgId);
        await supabaseAdmin.from('permission_profiles').delete().eq('organization_id', autoOrgId);
        await supabaseAdmin.from('user_organizations').delete().eq('organization_id', autoOrgId);
        await supabaseAdmin.from('organizations').delete().eq('id', autoOrgId);
      }
    } else {
      // Create user record in users table
      const nameParts = full_name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      const { data: createdUser, error: createUserError } = await supabaseAdmin
        .from('users')
        .insert({
          auth_user_id: newAuthUser.user.id,
          email,
          full_name,
          first_name: firstName,
          last_name: lastName,
        })
        .select('id')
        .single();

      if (createUserError || !createdUser) {
        console.error('Error creating user record:', createUserError);
        // Rollback: delete auth user
        await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id);
        return new Response(
          JSON.stringify({ error: 'Failed to create user record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      newUser = createdUser;
    }

    console.log('User record created:', newUser.id);

    // Create user_organizations record
    const { error: memberError } = await supabaseAdmin
      .from('user_organizations')
      .insert({
        user_id: newUser.id,
        organization_id,
        permission_profile_id,
        is_active: true,
      });

    if (memberError) {
      console.error('Error creating membership:', memberError);
      // Rollback: delete user record and auth user
      await supabaseAdmin.from('users').delete().eq('id', newUser.id);
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create user membership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update subscription usage
    await supabaseAdmin
      .from('subscription_usage')
      .update({ 
        current_seat_count: currentSeats + 1,
        last_calculated_at: new Date().toISOString()
      })
      .eq('subscription_id', subscription.id);

    console.log('User created successfully:', { userId: newUser.id, email });

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: newUser.id,
          email,
          full_name,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
