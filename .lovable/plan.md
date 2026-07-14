
## Caminho B — Consertar a UI e você ajusta

### Escopo (o que muda)

**Somente 3 arquivos de front-end. Nada de código de webhook, dispatcher, schema ou triggers.**

#### 1. `src/components/settings/IntegrationDetailDialog.tsx`
- Ampliar o dialog: `DialogContent` de `max-w-2xl` → `max-w-4xl`, `max-h-[90vh]`.
- Garantir que a coluna direita (toggles/botões "Desconectar"/"Verificar", pill de status) não seja cortada: `min-w-0` nos rows e `flex-wrap` onde couber.

#### 2. `src/components/integrations/meta-whatsapp-cloud/MetaWabasSection.tsx`
- Dentro do `.map((w) => ...)` de cada WABA, adicionar depois do `<MetaAdditionalEndpointsSection …/>`:
  ```tsx
  <WhatsAppInboundSettings integrationId={w.id} />
  ```
- Isso faz aparecer o bloco "Regras de Entrada" (com o toggle **Criar oportunidade automaticamente**) **para cada WABA**, gravando em `organization_integrations.whatsapp_inbound_settings` da linha correta.
- Passar `w.whatsapp_inbound_settings` para o `MetaAdditionalEndpointsSection` como `integrationFallback` (adicionar campo no `select` da query e no tipo `WabaRow`).

#### 3. `src/components/integrations/meta-whatsapp-cloud/MetaAdditionalEndpointsSection.tsx`
- Aceitar prop `integrationFallback` (igual ao componente Twilio).
- Dentro do `AccordionContent` de cada endpoint, adicionar:
  ```tsx
  <EndpointInboundSettings endpointId={ep.id} integrationFallback={integrationFallback} />
  ```
- Assim cada número (7020, 7027, 7067, 7491) tem override individual sobre a regra da WABA.

### Como você resolve depois que eu subir

1. Abrir `Configurações → Integrações → Meta WhatsApp Cloud API`.
2. Rolar até a WABA **"Central Trabalhista – Comercial" (…9158)**, no bloco "Regras de Entrada" que passa a aparecer → **ligar** "Criar oportunidade automaticamente".
3. Na WABA principal (…4877), abrir o accordion do número **7027**, no bloco "Regras deste número" → **desligar** "Criar oportunidade automaticamente" (override do endpoint).
4. Deixar 7020 e 7491 como estão.

### O que não vou fazer

- Nada de mudança no comportamento do webhook (a lógica de precedência `endpoint > integração > default` já existe).
- Nada em Twilio, Kommo, Lead Ads, dispatcher, migrations, triggers, RLS ou schema.
- Nada nas oportunidades existentes.

### Backfill (independente, roda depois)

Assim que você validar que a config está certa (novos leads no 7067 começam a criar opp), eu rodo o backfill dos ~129 órfãos:
- Alvo: `contacts` da Central Trabalhista com `source='ctwa'`, últimos 14 dias, sem oportunidade viva, cuja thread ativa está no endpoint 7067.
- Cria 1 opp `open`, primeira etapa por `order_index`, herda `owner_user_id`, preserva `created_at`.
- Mostro contagem exata e amostra antes de executar.

Aprovar para eu subir as 3 alterações de UI?
