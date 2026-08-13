# Fase 3 — WhatsApp Comercial multi-provider (contrato final da RPC + implementação)

Autorização recebida. Abaixo o contrato final da migração mínima e o restante da Fase 3, que segue em entrega única.

## Migração mínima (única) — `public.provision_sales_endpoint`

```text
provision_sales_endpoint(
  p_organization_id uuid,
  p_line_id         uuid,
  p_provider        text,   -- whitelist: meta | twilio | evolution
  p_address         text,
  p_display_name    text    DEFAULT NULL,
  p_instance_name   text    DEFAULT NULL   -- obrigatório quando provider = evolution
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

Ordem de execução (uma transação; qualquer `RAISE` desfaz tudo):

1. **Autorização** — `current_user_id()` não nulo, `p_organization_id = ANY(current_user_org_ids())` e `can_manage_integrations_in_org(p_organization_id)` ⇒ senão `PROVISION_FORBIDDEN`.
2. **Whitelist de provider** — apenas `meta`, `twilio`, `evolution`; qualquer outro ⇒ `PROVISION_PROVIDER_UNSUPPORTED`.
3. **Route** — `SELECT … FOR UPDATE` em `messaging_lines` (`p_line_id`); valida mesma org, `inbox_key='sales'`, `channel='whatsapp'` ⇒ `PROVISION_LINE_NOT_FOUND` / `PROVISION_NOT_SALES_ROUTE` / `PROVISION_CHANNEL_MISMATCH`.
4. **Posse do endereço na integração do tenant** (nunca aceita `p_address` arbitrário):
   - `meta` / `twilio`: exige row em `organization_phone_numbers` da mesma org, mesmo `provider`, com `phone_number` equivalente ao `p_address` (comparação por dígitos), **ou** um `communication_endpoints` já existente da mesma org/canal/endereço com o mesmo provider (número já provisionado pela tela de integração). Sem isso ⇒ `PROVISION_ADDRESS_NOT_OWNED`.
   - `evolution`: `p_instance_name` obrigatório (`PROVISION_INSTANCE_REQUIRED`); row em `evolution_instances` da mesma org (`PROVISION_INSTANCE_FOREIGN_ORG`); já vinculada a endpoint incompatível ⇒ `PROVISION_INSTANCE_CONFLICT`; `last_known_state <> 'open'` ⇒ `PROVISION_EVOLUTION_NOT_CONNECTED` (a Edge Function faz o `connectionState` real imediatamente antes e persiste o estado, então a RPC valida estado real, não intenção).
5. **Endpoint** — busca por `organization_id + channel + external_address`:
   - existe com provider diferente ⇒ `PROVISION_PROVIDER_CONFLICT` (nunca converte Meta↔Twilio↔Evolution);
   - existe com provider compatível ⇒ **reutiliza preservando o `id`**, reativa (`is_active`) e atualiza no máximo `display_name` quando vier preenchido; **não** toca `organization_integration_id`, `sender_sid`, `external_account_id`, `metadata`, `inbound_settings` nem qualquer credencial;
   - não existe ⇒ insere com `provider`, `channel='whatsapp'`, `purpose` de vendas e vínculo com a integração do tenant.
6. **Vínculo com a Route** — upsert em `messaging_line_endpoints`; se já existia desvinculado, apenas reativa (`is_active=true`, `unlinked_at=NULL`), sem apagar histórico.
7. **Mapeamento Evolution** — quando `provider='evolution'`, amarra `evolution_instances.endpoint_id` ao endpoint resultante (idempotente).
8. **Fora do escopo, por contrato** — não altera `messaging_lines.active_endpoint_id`, Route, resolver, canonicidade nem feature flags. "Tornar ativo" segue exclusivamente por `rotate_messaging_line_endpoint`.
9. **Retorno** — `jsonb` com `endpoint_id`, `line_id`, `provider`, `address_masked` (só os 4 últimos dígitos), `outcome: created|reused`, `link: created|reactivated|unchanged`, `evolution_mapping: linked|null`. Nenhum secret, token, key ou credencial no retorno.
10. **Superfície de execução** — `REVOKE EXECUTE … FROM PUBLIC` e `GRANT EXECUTE TO authenticated` apenas: a RPC depende de `current_user_id()`, então precisa rodar com o JWT do usuário (mesmo padrão de `rotate_messaging_line_endpoint`). Sem grant para `anon`. A própria função é o gate de permissão.

Rollback: `DROP FUNCTION public.provision_sales_endpoint(...)`. Sem novas tabelas, colunas ou policies.

## Testes de atomicidade e autorização (SQL, com ROLLBACK)

1. falha no vínculo com a Route ⇒ zero endpoint órfão;
2. conflito de provider ⇒ nenhuma alteração em nenhuma das 3 tabelas;
3. Evolution não conectada ⇒ nenhuma alteração;
4. instância Evolution de outra org ⇒ nenhuma alteração;
5. usuário sem `can_manage_integrations` ⇒ `PROVISION_FORBIDDEN`;
6. endereço não pertencente à integração ⇒ `PROVISION_ADDRESS_NOT_OWNED`, sem alteração;
7. sucesso ⇒ endpoint + vínculo + mapping Evolution consistentes na mesma transação;
8. reuso ⇒ mesmo `endpoint_id`, credenciais intactas, histórico preservado.

## Autorização nas operações (reuso, sem sistema paralelo)

- Mutações (`provisionEndpoint`, `setActiveEndpoint`, vínculo/desvínculo, `restart`, `reconnect`/QR, `disconnect`, `delete`): JWT do usuário + `can_manage_integrations_in_org(org)`; falha ⇒ `403 FORBIDDEN_INTEGRATIONS_ADMIN`. `setActiveEndpoint` mantém, adicionalmente, o `is_org_admin` que já existe dentro de `rotate_messaging_line_endpoint`.
- Leitura/status/diagnóstico/teste de conexão: JWT + vínculo ativo na org (RLS).
- `evolution-instance-manager` passa a aplicar o mesmo gate nas ops mutantes (mantendo rate limit, flag e validação de nome de instância); `connectionState`/`webhookFind`/`serverInfo` seguem como leitura.
- UI oculta ações mutantes quando `usePermissions().permissions.canManageIntegrations` é false — servidor continua sendo a autoridade.

## Atomicidade — `setActiveEndpoint`
Reuso integral de `rotate_messaging_line_endpoint` (já atômica: `FOR UPDATE`, validações, update de `active_endpoint_id` e insert em `messaging_line_rotations` com from/to/reason/autor/data). A Edge Function não faz updates soltos.

## Restante da Fase 3 (aprovado, inalterado)

- **Adapters** em `_shared/whatsapp-provider/` com capabilities declaradas (Evolution: QR, restart, reconnect, disconnect; Meta/Twilio: verificação de número e webhook), delegando às camadas específicas já existentes.
- **Edge Function `sales-route-operations`**: `status` (status REAL do provider cruzado com `communication_endpoints`/`evolution_instances`, com flag de divergência CRM × provider), `provisionEndpoint` (via RPC acima), `setActiveEndpoint` (via rotação), `diagnose` (checklist PASS/FAIL), `testConnection` (sem enviar mensagem).
- **`evolution-instance-manager`**: acrescenta apenas `restart` e `serverInfo` + gate de permissão.
- **Teste de envio** sempre pelo dispatcher/resolver Comercial real (`dispatchWhatsAppSend` → `salesReplyRoute`), exibindo Route, endpoint, provider e resultado.
- **Tela WhatsApp Comercial** (provider-agnostic): status geral com divergência; tabela de números/endpoints com ações filtradas por capability; wizard de novo número (Evolution: create → QR → Connected real → provisionar/vincular → perguntar "tornar ativo?"; Meta/Twilio: reutilizar integração e números já configurados, com atalho para a tela de integração quando o provider não estiver configurado); operações; histórico de trocas de `messaging_line_rotations`.
- **Separação mantida**: Integração (credenciais, telas atuais) ≠ Configuração (endpoints, números, vínculos) ≠ Regra (Route, `active_endpoint_id`, resolver, canonicidade). Sem duplicar credenciais, telas, fontes de verdade, endpoints, Routes ou managers.
- **Intocados**: Atendimento, Mobile, Resolver V2, trigger de canonicidade, merge/unmerge, flag `conv_route_resolver_v2`.

## QA final
Matriz PASS/FAIL por provider (Meta, Twilio, Evolution) × operação (status, diagnóstico, teste de conexão, provisionar, tornar ativo, reconectar, restart, desconectar, remover, teste de envio), mais gates de permissão e a bateria de atomicidade acima. Build/typecheck/console valido aqui; QR real, envio real e inbound real dependem do seu clique no preview autenticado.
