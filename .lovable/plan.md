# Fase 3 — WhatsApp Comercial multi-provider (revisado: autorização + atomicidade)

Plano anterior aprovado, com as duas correções arquiteturais exigidas resolvidas abaixo. Há **um ponto de parada**: o `provisionEndpoint` não tem hoje mecanismo transacional e precisa da sua autorização para uma migração mínima.

## Correção 1 — Autorização (reuso, sem sistema paralelo)

Helpers de autorização **já existentes** no banco (verificados):

| Helper | Assinatura | Uso |
|---|---|---|
| `can_manage_integrations_in_org(_org_id)` | SECURITY DEFINER, STABLE | gate de todas as operações que mudam infraestrutura WhatsApp |
| `user_has_org_permission(_org_id, _permission)` | idem, aceita `is_admin_user()` | alternativa genérica / admin de plataforma |
| `is_org_admin(_org_id)` | idem | já exigido internamente pela rotação de Route |
| `current_user_id()`, `current_user_org_ids()` | base das RLS | vínculo org do chamador |

Política aplicada (nada novo é inventado):

- **Mutações** — `provisionEndpoint`, `setActiveEndpoint`, vínculo/desvínculo com Route, `restart`, `reconnect` (connect/QR), `disconnect` (logout), `delete/remove`: exigem JWT de usuário **+** `can_manage_integrations_in_org(org)` = true, avaliado no servidor via RPC executada com o **JWT do usuário** (cliente anon com `Authorization` repassado, para que `current_user_id()` valha). Falha ⇒ `403 FORBIDDEN_INTEGRATIONS_ADMIN`.
- **Leitura/status/diagnóstico/teste de conexão**: JWT + vínculo ativo na org (RLS já cobre); sem exigência de permissão administrativa.
- `setActiveEndpoint` mantém, **além** disso, a checagem própria de `is_org_admin` que já existe dentro da RPC de rotação — não vou relaxá-la.
- `evolution-instance-manager` hoje só valida "JWT presente". Será acrescentado o mesmo gate para `create/connect/logout/delete/restart` (mantendo rate limit, flag e validação de nome de instância). `connectionState`, `webhookFind` e `serverInfo` seguem como leitura.
- A UI esconde ações de mutação quando `permissions.canManageIntegrations` é false (hook `usePermissions` existente) — o servidor continua sendo a autoridade.

## Correção 2 — Atomicidade real

### `setActiveEndpoint` — resolvido por reuso, sem migração
Já existe `public.rotate_messaging_line_endpoint(p_line_id, p_endpoint_id, p_reason)` — SECURITY DEFINER, e dentro de **uma única transação** ela: dá `SELECT ... FOR UPDATE` na linha, valida Route sales/org/canal/endpoint ativo/endpoint não em uso por outra Route, exige `is_org_admin`, garante o vínculo em `messaging_line_endpoints`, atualiza `messaging_lines.active_endpoint_id` e insere `messaging_line_rotations` com from/to/reason/autor/data. Qualquer `RAISE` desfaz tudo.
⇒ A operação passa a ser **exclusivamente** essa RPC, chamada com o JWT do usuário. Nada de update + insert separados na Edge Function.

### `provisionEndpoint` — PARADA: não existe mecanismo atômico
Writes que precisam ser atômicos em um único provisionamento:
1. `communication_endpoints` — insert (ou reuso/reativação do endpoint do mesmo org+canal+endereço);
2. `messaging_line_endpoints` — insert/reativação do vínculo com a Route Comercial;
3. `evolution_instances` — insert/atualização do mapeamento `instance_name → endpoint_id` (somente provider Evolution);
4. nada além disso (Route/`active_endpoint_id` fica fora — é a etapa "tornar ativo", já atômica pela rotação).

Hoje isso só é possível como 2–3 chamadas separadas do PostgREST/Edge Function, ou seja, estado parcial se uma etapa falhar (ex.: endpoint criado sem vínculo, ou instância Evolution órfã). Não existe RPC equivalente no projeto (só `resolve_communication_endpoint`, de leitura, e `populate_communication_endpoints_from_v2_senders`, backfill em massa).

**Menor migração possível — aguardando sua autorização (não vou criar sem o seu OK):**

```text
CREATE OR REPLACE FUNCTION public.provision_sales_endpoint(
  p_organization_id uuid,
  p_line_id         uuid,
  p_provider        text,          -- 'meta' | 'twilio' | 'evolution'
  p_address         text,          -- número/endereço já existente na integração
  p_display_name    text,
  p_instance_name   text DEFAULT NULL   -- apenas Evolution
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```
Conteúdo (uma transação, sem tocar Route/regra):
- exige `current_user_id() IS NOT NULL`, `p_organization_id = ANY(current_user_org_ids())` e `can_manage_integrations_in_org(p_organization_id)` — senão `PROVISION_FORBIDDEN`;
- `SELECT ... FOR UPDATE` na `messaging_lines` alvo; valida `inbox_key='sales'`, mesma org, canal `whatsapp`;
- upsert em `communication_endpoints` (org + canal + endereço), preservando row existente;
- upsert do vínculo em `messaging_line_endpoints` (reativa se estava `unlinked`);
- quando `p_provider='evolution'`: upsert em `evolution_instances` amarrando `instance_name` ao endpoint, com erro `PROVISION_INSTANCE_CONFLICT` se a instância já pertencer a outra org/endpoint;
- retorna `jsonb` com `endpoint_id`, `line_id`, `created|reused`.
Sem novas tabelas, sem novas colunas, sem GRANT novo além de `EXECUTE` para `authenticated`. Rollback = `DROP FUNCTION`.

Se você não autorizar essa RPC, a alternativa é o wizard não provisionar automaticamente: ele exibiria o passo "vincular número à Route" apontando para a tela existente `AddWhatsAppEndpointDialog` / `AdditionalEndpointsSection` — funcional, mas menos fluido.

## Restante do plano (inalterado e aprovado)

- **Adapters provider-agnostic** em `_shared/whatsapp-provider/`, declarando capabilities (Evolution: QR/restart/reconnect/disconnect; Meta/Twilio: verificação de número e webhook), delegando para a camada específica já existente de cada provider.
- **Edge Function `sales-route-operations`**: `status` (status REAL do provider cruzado com `communication_endpoints`/`evolution_instances`, com flag de divergência CRM × provider), `provisionEndpoint` (via RPC acima), `setActiveEndpoint` (via `rotate_messaging_line_endpoint`), `diagnose` (checklist PASS/FAIL), `testConnection` (sem enviar mensagem).
- **`evolution-instance-manager`**: acrescenta apenas `restart` e `serverInfo` + o gate de permissão.
- **Teste de envio** sempre pelo dispatcher/resolver Comercial real (`dispatchWhatsAppSend` → `salesReplyRoute`), mostrando Route, endpoint, provider e resultado.
- **Tela WhatsApp Comercial**: Status geral (com divergência), tabela de números/endpoints com ações por capability, wizard de novo número (Evolution: create → QR → Connected real → provisionar/vincular → perguntar "tornar ativo?"; Meta/Twilio: reutilizar integração e números já configurados, com atalho para a tela de integração quando o provider não estiver configurado), operações e histórico de trocas lido de `messaging_line_rotations`.
- **Separação mantida**: Integração (credenciais, telas atuais de Meta/Twilio/Evolution) ≠ Configuração (endpoints, números, vínculos) ≠ Regra (Route, `active_endpoint_id`, resolver, canonicidade). Sem duplicar credenciais, telas, fontes de verdade, endpoints, Routes ou managers.
- **Intocados**: Atendimento, Mobile, Resolver V2, trigger de canonicidade, merge/unmerge, flag `conv_route_resolver_v2`.

## QA final
Matriz PASS/FAIL por provider (Meta, Twilio, Evolution) × operação (status, diagnóstico, teste de conexão, provisionar, tornar ativo, reconectar, restart, desconectar, remover, teste de envio), mais os gates de permissão (usuário sem `can_manage_integrations` recebe 403) e de atomicidade (falha simulada não deixa estado parcial). Build/typecheck/console eu valido aqui; QR real, envio real e inbound real exigem seu clique no preview autenticado.

**Aguardo apenas o seu OK para a RPC `provision_sales_endpoint`** — com ele, sigo com a implementação completa em uma única entrega.
