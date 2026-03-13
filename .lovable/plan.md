

## Create User njunior@centraltrabalhista.com.br in Central Trabalhista

### Approach
Same as the admin user creation — use a temporary edge function with `verify_jwt = false` that:
1. Creates the auth user via `supabase.auth.admin.createUser()`
2. Handles the auto-created user record and org from the `handle_new_user` trigger
3. Cleans up the auto-created organization
4. Links the user to Central Trabalhista org with the **Admin** permission profile (`d0639f2f-8cdb-4c46-905c-04e27f4913f8`)

### Details
- **Email:** njunior@centraltrabalhista.com.br
- **Password:** 123456
- **Organization:** Central Trabalhista (`40ae935c-a7f7-4ad7-8ea4-91be6404a95f`)
- **Permission Profile:** Admin (`d0639f2f-8cdb-4c46-905c-04e27f4913f8`)

### Changes
1. **Create** `supabase/functions/create-tenant-user/index.ts` — temporary edge function
2. **Update** `supabase/config.toml` — add `[functions.create-tenant-user]` with `verify_jwt = false`
3. **Deploy & call** the function with the user data
4. **Delete** the function and revert config.toml after success

