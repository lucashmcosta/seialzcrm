# Proposta — hardening de auth nas edge functions críticas (2026-07-05)

Plano de correção para o grupo 🔴 de [`platform/security/verify-jwt-review.md`](../../platform/security/verify-jwt-review.md). Cada fase vira commit + deploy só com aprovação explícita.

> **Estado:** Fase 0 **implementada no repo** (commit local, não deployado): helper `validateCallerAuth`/`edgeAuthMode`/`logAuthObservation` em `_shared/auth.ts`, `_shared/twilio-signature.ts` novo, blocos de observação nas 4 funções. Default `EDGE_AUTH_ENFORCE=log` — **zero mudança de comportamento** até alguém setar `enforce`. Aguarda deploy aprovado para iniciar a janela de observação.

## Contexto que reduz o risco

Todos os chamadores legítimos conhecidos **já enviam credencial** — as funções apenas não conferem:

| Chamador | Credencial enviada hoje |
|---|---|
| Frontend (`supabase.functions.invoke`) | JWT do usuário no `Authorization` (automático) |
| Edge→edge (`_shared/dispatch-whatsapp-send.ts`, webhooks → `ai-agent-respond`) | `Bearer <service_role>` |
| API pública documentada (`src/pages/docs/ApiDocs.tsx`) | contrato já diz `Bearer <jwt-token>` |

Vetores de quebra a verificar antes de rejeitar: (a) integrações de clientes que hoje usam a **anon key** como bearer (funcionam só por causa da falha); (b) **Railway** `[INCERTO]` — confirmar se a mensageria chama `*-whatsapp-send` diretamente e com qual credencial (não há chamada no repo; a integração vive fora dele).

## Helper novo (base de todos os patches)

`supabase/functions/_shared/auth.ts` ganha:

```ts
// Aceita service_role OU JWT de usuário com vínculo ativo na org.
export async function validateCallerAuth(
  req: Request,
  organizationId: string,
): Promise<{ ok: true; kind: "service_role" | "user"; userId?: string } | { ok: false; error: string }> {
  const sr = validateServiceRoleAuth(req);
  if (sr.ok) return { ok: true, kind: "service_role" };

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, error: "missing bearer" };

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { ok: false, error: "invalid user jwt" };

  const { data: membership } = await admin
    .from("users")
    .select("id, user_organizations!inner(organization_id, is_active)")
    .eq("auth_user_id", user.id)
    .eq("user_organizations.organization_id", organizationId)
    .eq("user_organizations.is_active", true)
    .maybeSingle();
  if (!membership) return { ok: false, error: "no active membership in org" };

  return { ok: true, kind: "user", userId: membership.id };
}
```

Modo observação: env `EDGE_AUTH_ENFORCE` (`log` | `enforce`). Em `log`, falha de auth **não rejeita** — só grava `console.warn("[AUTH-OBSERVE] would-deny", { fn, reason, ua, ip })` para inventariar chamadores reais.

## Por função

### 1. `twilio-whatsapp-send` 🔴 crítica
- **Validação:** `validateCallerAuth(req, payload.organizationId)` no topo do `serve()` (payload já traz `organizationId` obrigatório).
- **Mecanismo:** JWT de usuário (com membership na org) OU service_role interno. **Não** usar shared secret: o contrato público documentado já é Bearer JWT.
- **Impacto esperado:** fecha "qualquer um envia WhatsApp em nome de qualquer org". Chamadores legítimos inalterados.
- **Risco de quebra:** baixo-médio — só quebra quem usa anon key (indevido) ou Railway se chamar sem service_role `[INCERTO]`. Mitigado pela fase de observação.
- **Patch:** ~10 linhas no topo do handler + helper acima.

### 2. `meta-whatsapp-send` 🔴 crítica
Idêntico ao item 1 (payload também traz `organizationId`). Mesmo patch, mesmo rollout.

### 3. `ai-agent-respond` 🔴 crítica (custo LLM + escrita em threads)
- **Chamadores:** webhooks Meta/Twilio (service_role) e `SDRAgentWizard` no frontend (JWT do usuário, teste de agente).
- **Validação:** `validateServiceRoleAuth` OU JWT de usuário com membership na org **do agente** — carregar `ai_agents.organization_id` pelo `agentId` do payload e validar contra ela (não confiar em org vinda do body).
- **Impacto:** fecha abuso de custo (invocações LLM anônimas) e injeção de respostas em threads.
- **Risco de quebra:** baixo — 2 chamadores conhecidos, ambos já credenciados. Fase de observação confirma que não há um terceiro.
- **Patch:** helper + lookup do agente antes do processamento (~15 linhas).

### 4. `twilio-webhook` 🔴 alta (eventos de voz forjáveis)
- **Chamador:** Twilio (externo — não tem JWT). **Mecanismo: assinatura `X-Twilio-Signature` (HMAC-SHA1 sobre URL + params ordenados, chave = Auth Token da org)** — mesma validação que `twilio-whatsapp-webhook` já implementa (resolução do Auth Token via `organization_integrations` + tolerância a variações de URL atrás de proxy).
- **Impacto:** impede forjar status de chamada/gravação e poluir `calls`/`call_recordings`.
- **Risco de quebra:** médio — reconstrução de URL atrás do gateway pode divergir da que o Twilio assinou (razão pela qual o webhook de WhatsApp testa múltiplas variantes). Obrigatório passar pela fase log-only.
- **Patch:** extrair a validação do `twilio-whatsapp-webhook` (linhas ~273–366) para `_shared/twilio-signature.ts` e usar nos dois webhooks (dedup de código + correção).

## Rollout (cada fase = commit + deploy aprovado)

1. **Fase 0 — observação:** helper + chamadas em modo `log` nas 4 funções. Deploy único. Sem mudança de comportamento.
2. **Fase 1 — monitorar 24–48h:** inventariar `[AUTH-OBSERVE]` nos logs. Confirmar Railway e eventuais integrações com anon key; se existirem, migrá-las para credencial correta antes da fase 2.
3. **Fase 2 — enforce:** `EDGE_AUTH_ENFORCE=enforce`. Sends/agent passam a responder 401/403; twilio-webhook rejeita assinatura inválida.
4. **Fase 3 — limpeza:** avaliar `verify_jwt=true` nas funções só-frontend (defesa em profundidade) e aposentar one-shots (ver review).

## Pré-requisitos antes da Fase 0
- [ ] Confirmar credencial usada pelo Railway ao enviar mensagens `[INCERTO]`.
- [ ] Confirmar se algum cliente usa a API pública documentada e com qual token.
- [ ] Definir onde `EDGE_AUTH_ENFORCE` é setado (secret por função via plataforma).
