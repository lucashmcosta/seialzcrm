# Liberação global da flag `evolution_api_enabled`

## Veredito

```text
GLOBAL_ENABLE_SAFE=YES
FEATURE_FLAGS_GLOBAL_SEMANTICS=is_enabled=true + organization_ids={} => habilitado para TODAS as orgs (derive(): orgs.length===0 => enabledForOrg)
INTEGRATION_FEATURE_FLAGS_GLOBAL_SEMANTICS=fn_feature_flag_enabled faz coalesce(override da org, linha organization_id IS NULL, false) => linha GLOBAL enabled=true libera todas as orgs sem override
EXPLICIT_FALSE_OVERRIDES=0 (nenhum override por org com enabled=false; o único false é a própria linha GLOBAL)
AUTO_SIDE_EFFECTS=NO
META_RISK=NONE
ATENDIMENTO_RISK=NONE
READY_FOR_GLOBAL_ENABLE=YES
```

## Respostas da auditoria (read-only)

1. **`feature_flags`** — sim. O frontend (`useSalesFeatureFlags.derive`, mesmo padrão nos demais hooks de flag) considera habilitado quando `is_enabled=true` e `organization_ids` vazio OU contém a org. Hoje: `is_enabled=true`, `organization_ids={Central, Viagi}` — escopo restrito.

2. **`integration_feature_flags`** — sim. `fn_feature_flag_enabled(_flag_key,_organization_id)` resolve por precedência: override da org → linha global (`organization_id IS NULL`) → `false`. Hoje: global `false`, overrides `true` para Viagi (`b246ef6f…`) e Central (`40ae935c…`).

3. **Overrides `false` por organização** — nenhum. Só existem os dois overrides `true`; o único `false` é a linha GLOBAL de default.

4. **Dependências de código** — a flag é lida apenas como porta de acesso às operações Evolution: `evolution-instance-manager`, `sales-route-operations` (ops Evolution: connect/QR/create/delete/link), `evolution-whatsapp-send`, `evolution-webhook`, e a página admin `AdminEvolution`. Nenhum outro domínio consome a flag; a escolha de provider no envio (`_shared/dispatch-whatsapp-send.ts`) depende de `communication_endpoints.provider`, não da flag.

5. **Efeitos automáticos** — nenhum:
   - criação de instância / endpoint: só via ops explícitas em `sales-route-operations` / `evolution-instance-manager`, todas exigindo JWT + `can_manage_integrations_in_org`;
   - Route / `active_endpoint_id` / rotação: nunca alterados pela flag; a ativação é ação separada com revalidação server-side;
   - Meta/Twilio: intocados — a flag não participa da resolução de provider;
   - Atendimento: intocado;
   - chamadas automáticas à Evolution: o único job automático é o cron `evolution-health-check` (5 min), que itera apenas linhas existentes em `evolution_instances`.

**Estado real dos dados:** somente a Viagi possui 1 `evolution_instances` e 1 `communication_endpoints` com `provider='evolution_api'`. Nenhuma outra organização tem qualquer objeto Evolution — logo o health-check e o roteamento de envio continuam idênticos após o ON global.

**Observação (não bloqueante):** as credenciais do servidor Evolution são globais (env de secrets), então liberar globalmente significa que qualquer admin de integrações de qualquer org poderá criar instâncias no mesmo servidor Evolution compartilhado (consumo de capacidade). Isolamento de dados permanece por `organization_id` + RLS; é uma questão de capacidade, não de segurança.

## Alteração proposta

Uma única migração, apenas de flags, sem DDL e sem toque em endpoints/routes:

1. `feature_flags`: `evolution_api_enabled` → `is_enabled=true`, `organization_ids='{}'` (global).
2. `integration_feature_flags`: linha GLOBAL (`organization_id IS NULL`) → `enabled=true`.
3. Manter os overrides `true` de Viagi e Central (redundantes, porém inofensivos) para preservar histórico.

Nenhum `false` por org existe para preservar.

## Validação pós-alteração (read-only)

- `fn_feature_flag_enabled('evolution_api_enabled', <org amostra>)` = true para orgs diversas, inclusive sem override.
- `EVOLUTION_INSTANCES_TOTAL` inalterado (1, Viagi); `evolution_api` endpoints inalterado (1, Viagi).
- `META_ACTIVE_ENDPOINT=7067` e `ACTIVE_ENDPOINT_CHANGED=NO`; `MESSAGING_LINE_ROTATIONS_NEW=0`.
- Atendimento (+55 11 5028-7027) inalterado.

## Rollback

`UPDATE integration_feature_flags SET enabled=false WHERE flag_key='evolution_api_enabled' AND organization_id IS NULL;` e restaurar `organization_ids` em `feature_flags` para `{Central, Viagi}` — efeito em ≤ 60s (TTL do cache das edge functions).
