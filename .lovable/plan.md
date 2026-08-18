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
Gravar em `communication_endpoints.inbound_settings` **a mesma configuração efetiva do 7067** (o passo 1 da cadeia que já existe) — mas fazendo isso **no provisionamento da Fase 3**, não em migração por número. Zero lógica nova nos webhooks: o Evolution resolve `source="endpoint"` com o mesmo JSON do 7067.

Alternativa descartada: apontar `organization_integration_id` do endpoint Evolution para a integração Meta `46231cd1…` — isso misturaria credenciais de provedores diferentes e quebraria os guards de provider.

## Plano de implementação

### Etapa 1 — Herança padrão no provisionamento (comportamento permanente)
Alterar a RPC `public.provision_line_endpoint` (criada na Fase 3): no momento em que ela **insere** um novo `communication_endpoints`, preencher `inbound_settings` com a configuração de entrada efetiva de referência da própria organização, quando o endpoint nasce sem ela.

Resolução da referência, dentro da RPC (helper `public.fn_default_inbound_settings(p_organization_id, p_purpose)`):

```text
1. inbound_settings do endpoint WhatsApp ativo de referência da org
   (mesmo purpose, provider meta_cloud_api → hoje o 7067 para Comercial)
2. whatsapp_inbound_settings da organization_integrations desse endpoint
   → é o caminho real hoje, pois o 7067 tem inbound_settings NULL
3. fallback { auto_create_contact: true, default_lifecycle_stage: 'lead',
             auto_create_opportunity: true, default_stage_id: null }
```

Regras da herança:
- aplica-se a **qualquer novo endpoint** provisionado (Evolution, Twilio, Meta) que não traga `inbound_settings` — Evolution Comercial passa a nascer igual ao 7067 automaticamente, sem migração futura;
- a referência é sempre da **mesma organização** e do **mesmo `purpose`** (Comercial herda de Comercial, Atendimento de Atendimento) — nunca cruza org nem finalidade;
- só grava na **criação**; endpoints existentes não são reescritos pela RPC;
- quando existir tela própria de configuração, ela passa a editar `inbound_settings` do endpoint e a herança deixa de ter efeito naturalmente.

Nada mais muda: `purpose`, `assigned_user_id`, `active_endpoint_id`, rotação, vínculos e Atendimento seguem com o comportamento aprovado na Fase 3.

### Etapa 2 — Migração excepcional do 7020 já existente
Uma única migração de dado, marcada como excepcional, para o endpoint Evolution `3ed219e0…` (Central, +55 11 5028-7020) criado antes da Etapa 1:

- fonte: configuração efetiva do 7067 (`whatsapp_inbound_settings` da oi `46231cd1…`), lida na própria migração — sem literal duplicado;
- destino: `communication_endpoints.inbound_settings` do endpoint `3ed219e0…`;
- condição: só onde `inbound_settings IS NULL` (idempotente);
- o endpoint Evolution da Viagi (piloto de julho) fica **fora** desta migração.

Pós-condições exigidas:

```text
EVOLUTION_7020_EFFECTIVE_SETTINGS_MATCH_7067=PASS
ENDPOINTS_OUTROS_ALTERADOS=0
ACTIVE_ENDPOINT_CHANGED=NO
ORG_INTEGRATION_ID_CHANGED=NO
```

### Etapa 3 — Verificação funcional
- Provisionar um endpoint Evolution Comercial de teste e confirmar que ele nasce com `inbound_settings` igual à efetiva do 7067 (sem migração).
- Confirmar `source="endpoint"` na resolução do 7020.
- Um inbound real no 7020 deve criar contato `lifecycle_stage=lead` + oportunidade na primeira etapa do pipeline, com dono = dono do contato.


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
