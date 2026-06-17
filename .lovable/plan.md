## Objetivo

Cada número WhatsApp (principal e adicionais) tem suas **próprias Regras de Entrada**, ou herda as gerais. Webhook respeita essa hierarquia ao criar contato, lifecycle e oportunidade. Lookup do endpoint usa a RPC já existente — sem query extra varrendo todos os endpoints.

---

## 1. Migration

```sql
ALTER TABLE public.communication_endpoints
  ADD COLUMN IF NOT EXISTS inbound_settings jsonb;

COMMENT ON COLUMN public.communication_endpoints.inbound_settings IS
  'Regras de entrada (auto_create_contact, default_lifecycle_stage, auto_create_opportunity, default_stage_id) específicas deste número. NULL = herda de organization_integrations.whatsapp_inbound_settings.';
```

Sem GRANTs novos — tabela já tem políticas/privilégios.

---

## 2. Diff do webhook — `supabase/functions/twilio-whatsapp-webhook/index.ts`

O webhook **já resolve** o endpoint pelo `To` via `rpc('resolve_communication_endpoint', { _organization_id, _channel, _address })` (linhas 748–771). Hoje essa resolução roda **depois** que `inboundSettings` é montado (linha 561) e usado para criar contato (linha 598).

**Mudança:** mover a resolução do `endpointId` para **antes** da montagem de `inboundSettings`, e quando `endpointId` existir, fazer **uma única query direta por id** para ler `inbound_settings`.

### 2a. Mover bloco de resolução do endpoint

- Recortar linhas 744–771 (bloco `Resolve communication_endpoint from To`) e colá-lo **logo antes** do bloco atual `// Parse inbound settings` (antes da linha 561).
- Nenhuma lógica interna desse bloco muda — só a posição.

### 2b. Substituir o bloco `Parse inbound settings` (atual linhas 561–566)

**Antes:**
```ts
const inboundSettings = (integration?.whatsapp_inbound_settings as any) || {
  auto_create_contact: true,
  default_lifecycle_stage: 'lead',
  auto_create_opportunity: false,
}
```

**Depois:**
```ts
// Hierarquia: endpoint.inbound_settings > integration.whatsapp_inbound_settings > hardcoded fallback
let endpointInbound: any = null
if (endpointId) {
  const { data: epRow, error: epInbErr } = await supabase
    .from('communication_endpoints')
    .select('inbound_settings')
    .eq('id', endpointId)
    .maybeSingle()
  if (epInbErr) {
    console.warn('[wa-inbound] endpoint inbound_settings fetch error', JSON.stringify({
      endpointId, err: epInbErr.message,
    }))
  } else {
    endpointInbound = (epRow?.inbound_settings as any) ?? null
  }
}

const integrationInbound = (integration?.whatsapp_inbound_settings as any) || null

const inboundSettings = endpointInbound || integrationInbound || {
  auto_create_contact: true,
  default_lifecycle_stage: 'lead',
  auto_create_opportunity: false,
}

console.log('[wa-inbound] settings resolved', JSON.stringify({
  endpointId, source: endpointInbound ? 'endpoint' : (integrationInbound ? 'integration' : 'default'),
}))
```

Nenhuma outra linha muda — `inboundSettings.auto_create_contact`, `default_lifecycle_stage`, `auto_create_opportunity`, `default_stage_id` continuam sendo consumidos como hoje (linhas 598, 609, 620, 646).

### Restrições explícitas atendidas

- ✅ Sem nova query buscando todos os endpoints.
- ✅ Sem filtro client-side por número.
- ✅ Lookup direto por `id = endpointId` (PK).
- ✅ Reuso da RPC `resolve_communication_endpoint` que já existia.

---

## 3. Diff da UI

### 3a. Novo `src/components/settings/EndpointInboundSettings.tsx`

Cópia adaptada de `WhatsAppInboundSettings`. Props:

```ts
interface Props {
  endpointId: string;
  integrationFallback: InboundSettings | null;
}
```

- `useQuery` lê `communication_endpoints.inbound_settings` por `endpointId`.
- Estado `useGeneralRules` — inicia `true` se `inbound_settings === null`.
- Toggle **"Usar regras gerais da integração"** no topo:
  - **Ligado:** mostra campos desabilitados com valores do `integrationFallback` (read-only). Salvar grava `inbound_settings = NULL`.
  - **Desligado:** habilita os campos (criar contato, lifecycle, criar oportunidade, etapa). Salvar grava JSON em `inbound_settings`.
- Invalida `['endpoint-inbound', endpointId]` no sucesso.

### 3b. Novo `src/components/settings/AdditionalEndpointsSection.tsx`

- `useQuery` em `communication_endpoints` filtrando `organization_id`, `channel='whatsapp'`, `organization_integration_id = orgIntegration.id`, ordem `created_at desc`.
- Filtro client-side: remove os que batem com `whatsapp_number` (oficial já é o "Número Principal").
- `<Accordion type="multiple">` — um item por endpoint:
  - **Trigger:** ícone Phone + número formatado (`formatPhoneDisplay`) + badge status + apelido.
  - **Content:**
    - Sender SID mascarado (últimos 8)
    - "Cadastrado em" (data)
    - Ações: editar apelido (input + Salvar), Ativar/Desativar (`is_active` toggle com confirm), Remover (DELETE com confirm)
    - `<EndpointInboundSettings endpointId={ep.id} integrationFallback={integrationFallback} />`
- Empty state: nada renderiza se não houver endpoints adicionais.

### 3c. `src/components/settings/IntegrationDetailDialog.tsx`

Dentro de `renderWhatsAppConfig()`, inserir **antes** do botão "Adicionar número WhatsApp":

```tsx
<AdditionalEndpointsSection
  organizationId={organization.id}
  organizationIntegrationId={orgIntegration.id}
  officialNumber={configValues.whatsapp_number}
  integrationFallback={orgIntegration.whatsapp_inbound_settings as any}
/>
```

`WhatsAppInboundSettings` (regras gerais) permanece como hoje, no fim do modal — é o fallback que cobre o número principal e qualquer endpoint sem `inbound_settings` próprio.

---

## 4. Plano de teste (Central Trabalhista: 7027 + 7067)

### Setup

1. Aplicar migration → `inbound_settings` existe e é NULL em todos endpoints.
2. UI mostra seção "Números adicionais" com 7067; toggle "Usar regras gerais" ligado.

### Caso A — 7027 com regra A

- Regras gerais (`WhatsAppInboundSettings`): `auto_create_contact=true`, `lifecycle=lead`, `auto_create_opportunity=false`. Salvar.
- 7067 mantém toggle "Usar regras gerais" ligado.
- Enviar WhatsApp de número novo X → **destino 7027**.
- **Esperado:** contato criado `lifecycle=lead`, **sem** oportunidade.
- Log: `[wa-inbound] settings resolved { endpointId: <7027>, source: "integration" }`.

### Caso B — 7067 com regra B (oportunidade automática)

- No `EndpointInboundSettings` do 7067: desligar toggle, marcar `auto_create_contact=true`, `lifecycle=opportunity`, `auto_create_opportunity=true`, etapa "Qualificação". Salvar.
- DB: `select external_address, inbound_settings from communication_endpoints where organization_id=... and channel='whatsapp'` → 7067 com JSON, 7027 NULL.
- Enviar WhatsApp de número novo Y → **destino 7067**.
- **Esperado:** contato `lifecycle=opportunity`, oportunidade aberta em "Qualificação".
- Log: `source: "endpoint"`.

### Caso C — regressão 7027

- Enviar de número novo Z → **destino 7027**.
- **Esperado:** mesmo comportamento do Caso A. Regra B do 7067 **não vaza** para 7027.

### Caso D — tenant 1 endpoint (Viagi)

- Sem mudanças. Inbound continua usando `integrationInbound`. Log: `source: "integration"` (ou `"default"` se nem geral existe).

### Caso E — voltar 7067 a herdar

- Religar toggle no 7067 → `inbound_settings = NULL`.
- Próximo inbound para 7067 → log `source: "integration"`, regra A.

---

## Fora de escopo

- `NewConversationDialog`, roteamento de saída, badge, `useOrgWhatsAppEndpoints`, `AddWhatsAppEndpointDialog`, mobile.
- UI para `default_pipeline_id` (segue como hoje: só `default_stage_id`).
- Webhook secundário `twilio-webhook` (canal voz/legacy): fora deste escopo.
