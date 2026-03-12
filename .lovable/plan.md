

## Create Admin User for njunior@seialz.com

### Problem
Cannot create admin users from the app or via direct SQL because:
1. Auth users can only be created via Supabase Auth Admin API (requires service_role key)
2. `admin_users` table blocks INSERT via RLS

### Solution
Create an edge function `create-admin-user` that uses the service_role key to:
1. Create the auth user with email `njunior@seialz.com` and password `123456`
2. Insert the corresponding record in `admin_users`
3. Call it once to create the user, then optionally remove the function

### Changes

**1. New edge function: `supabase/functions/create-admin-user/index.ts`**
- Uses `SUPABASE_SERVICE_ROLE_KEY` to call `supabase.auth.admin.createUser()`
- Inserts into `admin_users` table with service role client (bypasses RLS)
- Sets `verify_jwt = false` temporarily so we can call it directly
- Accepts `email`, `password`, `full_name` in the request body

**2. `supabase/config.toml`**
- Add `[functions.create-admin-user]` with `verify_jwt = false`

After creating the user, we deploy the function, call it via curl, and then delete it for security.

