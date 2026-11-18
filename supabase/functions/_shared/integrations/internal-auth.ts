// Autenticação de chamada interna (agendador → função) por IGUALDADE EXATA com
// uma das duas chaves internas do projeto:
//   - SUPABASE_SERVICE_ROLE_KEY, a variável de ambiente da própria função;
//   - a chave guardada no cofre, que os jobs do pg_cron enviam
//     (public.get_internal_function_auth_token(), só service_role).
//
// Não decodifica o token nem confia nas claims: um JWT com `role: service_role`
// montado por qualquer pessoa NÃO passa aqui, porque não é igual a nenhuma das
// duas chaves. Funções com verify_jwt = false não têm o gateway conferindo a
// assinatura, então conferir só as claims não basta.

/** Comparação em tempo constante. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
}

/** O token é uma das chaves internas conhecidas? `knownKeys` vazio ou só com vazios = ninguém passa. */
export function isInternalToken(token: string, knownKeys: Array<string | null | undefined>): boolean {
  if (!token) return false;
  let ok = false;
  for (const key of knownKeys) {
    // Sem interromper no primeiro acerto, para o tempo não depender de qual chave casou.
    if (typeof key === "string" && key.trim() && sameSecret(token, key.trim())) ok = true;
  }
  return ok;
}

// deno-lint-ignore no-explicit-any
export async function isInternalCaller(req: Request, supabase: any): Promise<boolean> {
  const token = bearerToken(req);
  if (!token) return false;
  let vaultKey: string | null = null;
  try {
    const { data } = await supabase.rpc("get_internal_function_auth_token");
    vaultKey = typeof data === "string" ? data : null;
  } catch {
    vaultKey = null;
  }
  return isInternalToken(token, [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), vaultKey]);
}
