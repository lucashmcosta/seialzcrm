# Correção estrutural: mesmo número físico em dois providers (Meta 7020 histórico + Evolution 7020)

Nada executado ainda. SQL final abaixo, para aprovação.

## Pré-check bloqueante (já executado, READ-ONLY)

```text
uq_comm_endpoints_org_channel_address É CONSTRAINT? NO  (índice independente → DROP INDEX)
DUP (org, channel, normalized_address, provider) = 0
DUP ATIVOS (org, channel, normalized_address, is_active=true) = 0
PROVIDER NULL = 0
external_address sem dígitos = 0
Código dependente do nome do índice antigo / ON CONFLICT = 0
```

Nenhum conflito. O pré-check é repetido dentro da migração como gate `RAISE EXCEPTION`, para o caso de mudança entre agora e a execução.

## Peça 1 — Índices normalizados (ordem segura)

Identidade lógica: `org + channel + normalized_address + provider`.
Trava operacional: no máximo **um endpoint ativo** por número físico.

```sql
BEGIN;

-- gate 1: duplicidade provider-aware
IF EXISTS (...) -> RAISE 'PRECHECK_DUP_PROVIDER_AWARE'   -- (bloco DO abaixo)
-- gate 2: dois ativos no mesmo número
-- gate 3: provider NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.communication_endpoints
     WHERE external_address IS NOT NULL
     GROUP BY organization_id, channel,
              regexp_replace(COALESCE(external_address,''),'\D','','g'), provider
    HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'PRECHECK_DUP_PROVIDER_AWARE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.communication_endpoints
     WHERE external_address IS NOT NULL AND is_active
     GROUP BY organization_id, channel,
              regexp_replace(COALESCE(external_address,''),'\D','','g')
    HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'PRECHECK_DUP_ACTIVE_SAME_NUMBER';
  END IF;

  IF EXISTS (SELECT 1 FROM public.communication_endpoints WHERE provider IS NULL) THEN
    RAISE EXCEPTION 'PRECHECK_PROVIDER_NULL';
  END IF;
END $$;

-- (a) identidade provider-aware, número normalizado
CREATE UNIQUE INDEX uq_comm_endpoints_org_channel_digits_provider
  ON public.communication_endpoints (
    organization_id, channel,
    regexp_replace(COALESCE(external_address,''),'\D','','g'), provider)
  WHERE external_address IS NOT NULL;

-- (b) trava: um único endpoint ATIVO por número físico
CREATE UNIQUE INDEX uq_comm_endpoints_org_channel_digits_active
  ON public.communication_endpoints (
    organization_id, channel,
    regexp_replace(COALESCE(external_address,''),'\D','','g'))
  WHERE external_address IS NOT NULL AND is_active;

-- (c) validação: ambos existem e são únicos
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_indexes
       WHERE schemaname='public' AND tablename='communication_endpoints'
         AND indexname IN ('uq_comm_endpoints_org_channel_digits_provider',
                           'uq_comm_endpoints_org_channel_digits_active')) <> 2 THEN
    RAISE EXCEPTION 'INDEX_VALIDATION_FAILED';
  END IF;
END $$;

-- (d) só então remover o índice antigo (índice independente, não constraint)
DROP INDEX IF EXISTS public.uq_comm_endpoints_org_channel_address;

COMMIT;
```

`regexp_replace` é IMMUTABLE, portanto válido em índice de expressão. Nenhum dado é alterado nesta peça.

## Peça 2 — `provision_sales_endpoint`: resolução por número normalizado + família de provider

Somente o passo 5 muda (mesma assinatura, mesmo restante do corpo, `SECURITY DEFINER`, `search_path=public`):

```sql
  -- 5. identidade do endpoint: número normalizado + família do provider
  SELECT count(*) INTO v_ep_count FROM public.communication_endpoints
   WHERE organization_id = p_organization_id AND channel = 'whatsapp'
     AND regexp_replace(COALESCE(external_address,''),'\D','','g') = v_digits
     AND provider = ANY (v_family);
  IF v_ep_count > 1 THEN RAISE EXCEPTION 'PROVISION_ENDPOINT_AMBIGUOUS'; END IF;

  IF v_ep_count = 1 THEN
    SELECT id, provider INTO v_endpoint_id, v_ep_provider
      FROM public.communication_endpoints
     WHERE organization_id = p_organization_id AND channel = 'whatsapp'
       AND regexp_replace(COALESCE(external_address,''),'\D','','g') = v_digits
       AND provider = ANY (v_family)
     FOR UPDATE;
  ELSE
    -- nenhum candidato da própria família: outro provider com o mesmo número
    -- só é aceitável se estiver INATIVO (histórico preservado, nunca alterado)
    IF EXISTS (
      SELECT 1 FROM public.communication_endpoints
       WHERE organization_id = p_organization_id AND channel = 'whatsapp'
         AND regexp_replace(COALESCE(external_address,''),'\D','','g') = v_digits
         AND NOT (provider = ANY (v_family))
         AND is_active) THEN
      RAISE EXCEPTION 'PROVISION_ADDRESS_ACTIVE_ON_OTHER_PROVIDER';
    END IF;
  END IF;
```

Consequências:
- `v_endpoint_id` fica NULL quando só existe o endpoint Meta inativo → passo 7 **cria** um endpoint novo `evolution_api`; o `UPDATE ... provider = COALESCE(provider, v_canonical)` só roda no endpoint reutilizado da mesma família, logo o Meta histórico nunca é tocado.
- `PROVISION_PROVIDER_CONFLICT` deixa de ocorrer nesse cenário; o novo erro fail-closed é `PROVISION_ADDRESS_ACTIVE_ON_OTHER_PROVIDER`.
- Nenhuma escolha arbitrária: 2+ candidatos da mesma família continuam em `PROVISION_ENDPOINT_AMBIGUOUS`.
- Passo 6 (posse do endereço) e demais gates ficam inalterados. Evolution continua exigindo instância `open`, mesma org e `owner_number_digits` batendo com o número.

## Concorrência / idempotência

Mantidos e agora reforçados:
- `pg_advisory_xact_lock('ce:<org>:whatsapp:<digits>')` serializa duplo clique e requisições paralelas no mesmo número.
- `FOR UPDATE` no candidato e na `messaging_lines` / `evolution_instances`.
- Proteção final no banco: os dois índices únicos normalizados — um INSERT concorrente que escapasse do lock falharia no índice, não silenciosamente.
- Repetir a operação após sucesso é idempotente: `outcome='reused'`, link `unchanged`, `evolution_mapping='unchanged'`.

## Fora de escopo nesta etapa

Webhooks (Meta/Twilio/Evolution), Resolver V2, "Responder por", `active_endpoint_id`, rotações, Atendimento e UI. A UI ficará mostrando duas linhas do 7020 (Meta inativo e Evolution) até o ajuste visual seguinte — sem impacto funcional.

## Pós-condições a auditar após execução e vínculo

```text
META_7020_ENDPOINT_ID_UNCHANGED=PASS      (407ff93d…)
META_7020_PROVIDER_UNCHANGED=PASS         (meta_cloud_api, is_active=false)
MESSAGES_ENDPOINT_REFS_UNCHANGED=19398
THREADS_PRIMARY_ENDPOINT_REFS_UNCHANGED=1436
EVOLUTION_7020_ENDPOINT_CREATED=YES
EVOLUTION_7020_PROVIDER=evolution_api
EVOLUTION_7020_LINKED_TO_COMMERCIAL=YES
EVOLUTION_7020_ACTIVE_ENDPOINT=NO
META_7067_STILL_ACTIVE=YES
ACTIVE_ENDPOINT_CHANGED=NO
MESSAGING_LINE_ROTATIONS_NEW=0
ATENDIMENTO_CHANGED=NO
```

## Ordem de execução após aprovação

1. Migração Peça 1 (gates + índices a/b + validação + drop do antigo).
2. Migração Peça 2 (`CREATE OR REPLACE FUNCTION provision_sales_endpoint`).
3. Você clica em "Vincular ao WhatsApp Comercial" no card Evolution.
4. Eu rodo a auditoria das pós-condições acima.
