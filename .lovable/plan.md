# Evolution herda as regras de entrada do número Meta (11) 5028-7067

## Auditoria (read-only, feita agora)

### De onde saem as configurações do 7067
O 7067 é o endpoint `bf04ce63-d310-4c16-a133-b373a40df340` (`provider=meta_cloud_api`, `purpose=commercial`, org Central `40ae935c…`).

Cadeia de resolução usada pelos webhooks (função `resolveInboundSettings`, idêntica em Meta, Twilio e Evolution):

```text
1. communication_endpoints.inbound_settings   (por número)
2. organization_integrations.whatsapp_inbound_settings  (via organization_integration_id)
3. DEFAULT_INBOUND_SETTINGS (hardcode na function)
```

Estado real hoje:
- `communication_endpoints.inbound_settings` está **NULL em todos** os endpoints WhatsApp, inclusive no 7067.
- Logo o 7067 resolve no **passo 2**, na `organization_integrations` `46231cd1-9d4e-4def-903f-6bef14e5c087`:

```json
{ "auto_create_contact": true,
  "default_lifecycle_stage": "lead",
  "auto_create_opportunity": true,
  "default_opportunity_owner": "contact_owner",
  "default_pipeline_id": null,
  "default_stage_id": null }
```

- `default_stage_id: null` → a etapa inicial é resolvida em runtime como a primeira `pipeline_stages` da organização por `order_index`.

### Quem consome esses valores
- `supabase/functions/meta-whatsapp-webhook/index.ts` → `resolveInboundSettings` → `findOrCreateContact` (usa `auto_create_contact`, `default_lifecycle_stage`) → `autoCreateOpportunityIfEnabled` (usa `auto_create_opportunity`, `default_stage_id`, dono = `owner_user_id` do contato), chamada só quando o contato é **recém-criado**.
- `supabase/functions/evolution-webhook/index.ts` → possui as **mesmas três funções, com lógica equivalente linha a linha** (mesma ordem de resolução, mesmo fallback de etapa, mesma guarda de oportunidade aberta existente).
- `supabase/functions/twilio-whatsapp-webhook/index.ts` → mesmo padrão.

### Por que o Evolution não cria oportunidade hoje
Não é diferença de código — é diferença de **dado**. Os dois endpoints Evolution existentes têm `organization_integration_id = NULL`:

| endpoint | número | org | oi | inbound_settings |
|---|---|---|---|---|
| `3ed219e0…` | +55 11 5028-7020 | Central | NULL | NULL |
| `11111111-e701…` | +55 11 93619-8439 | Viagi (piloto) | NULL | NULL |

Sem passo 1 e sem passo 2, caem no passo 3 (`DEFAULT_INBOUND_SETTINGS`), onde `auto_create_opportunity: false`. Resultado: contato é criado (default `true`), oportunidade não.

### Forma mais simples de reutilizar exatamente a mesma configuração
Gravar em `communication_endpoints.inbound_settings` do endpoint Evolution **a mesma configuração efetiva do 7067** (o passo 1 da cadeia que já existe). Zero código novo, zero lógica nova, zero alteração de webhook: o Evolution passa a resolver `source="endpoint"` com o mesmo JSON do 7067.

Alternativa descartada: apontar `organization_integration_id` do endpoint Evolution para a integração Meta `46231cd1…` — isso misturaria credenciais de provedores diferentes e quebraria os guards de provider.

## Plano de implementação

### Etapa 1 — Migração de dado (uma tabela, uma coluna)
Copiar a configuração efetiva do 7067 para o `inbound_settings` do endpoint Evolution `3ed219e0…` (Central), lendo o valor da `organization_integrations` do 7067 dentro da própria migração (sem literal duplicado):

- fonte: `whatsapp_inbound_settings` da oi do endpoint `bf04ce63…`
- destino: `communication_endpoints.inbound_settings` do endpoint Evolution da Central
- condição: aplicar só onde `inbound_settings IS NULL` (idempotente)
- nada mais é alterado: `purpose`, `is_active`, `organization_integration_id`, `messaging_lines`, `active_endpoint_id`, rotas e Atendimento ficam intocados.

Pós-condições exigidas antes de seguir:

```text
EVOLUTION_EFFECTIVE_SETTINGS_MATCH_7067=PASS
ENDPOINTS_OUTROS_ALTERADOS=0
ACTIVE_ENDPOINT_CHANGED=NO
ORG_INTEGRATION_ID_CHANGED=NO
```

### Etapa 2 — Verificação funcional
Reexecutar a leitura da cadeia (`endpoint → integração → default`) e confirmar `source="endpoint"` com o mesmo JSON do 7067. Um inbound real no 7020 Evolution deve criar contato `lifecycle_stage=lead` + oportunidade na primeira etapa do pipeline, com dono = dono do contato.

### Etapa 3 — Backfill das oportunidades não criadas

Levantamento real (contatos com inbound recebido em endpoint Evolution):

| org | contatos | sem nenhuma oportunidade | sem oportunidade aberta | período |
|---|---|---|---|---|
| Central `40ae935c…` | 45 | **29** | 41 | 14/08 18:50 → 18/08 15:46 |
| Viagi `b246ef6f…` (piloto) | 406 | 264 | 295 | 20/07 → 30/07 |

Regras do backfill — exatamente as do 7067, replicando `autoCreateOpportunityIfEnabled`:
- só contatos cujo primeiro inbound veio de endpoint Evolution;
- pular quem já tem oportunidade **aberta** não excluída (mesma guarda do webhook);
- `pipeline_stage_id` = primeira etapa da organização por `order_index` (pois `default_stage_id` é null);
- `title` = `Oportunidade - <nome do contato>`;
- `status = 'open'`, `owner_user_id` = `owner_user_id` do contato quando existir;
- execução em transação única com `batch_id` inédito registrado, contagem antes/depois e possibilidade de reversão pelo lote.

Escopo proposto: **somente a Central (29 contatos sem nenhuma oportunidade)**, a partir de 14/08/2026, quando o Evolution 7020 entrou. Os 406 da Viagi são do piloto de julho e ficam fora por padrão.

### Ordem de execução
1. migração de dado (Etapa 1) + pós-condições;
2. verificação funcional (Etapa 2);
3. dry-run do backfill (lista dos 29 contatos, etapa e dono resolvidos) para sua aprovação;
4. commit do backfill somente após aprovação do dry-run.

## Confirmações
- NOVA_LOGICA_EVOLUTION=NO (nenhuma função de webhook é alterada)
- SCHEMA_CHANGE_REQUIRED=NO (apenas UPDATE de dado em `communication_endpoints.inbound_settings`)
- META_ENDPOINTS_TOUCHED=NO
- ACTIVE_ENDPOINT_CHANGE=NO
- ATENDIMENTO_CHANGE=NO
- BACKFILL_VIAGI_INCLUDED=NO (a confirmar se você quiser incluir)

## Pergunta aberta
Backfill deve cobrir também os 264 contatos do piloto Viagi (julho), ou apenas a Central?
