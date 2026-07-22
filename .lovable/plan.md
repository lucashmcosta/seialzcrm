## Objetivo

Atualizar a documentação existente para refletir duas mudanças que já estão em produção:

1. **Roteamento por linha ativa restaurado nas 3 send functions** (Evolution/Meta/Twilio): honram `endpointId` explícito do dispatcher em vez de forçar `primary_endpoint_id` da thread. Log `endpoint_override_ignored` (warn) virou `line_routing_honored` (info).
2. **Nova capacidade `communication_endpoints.requires_template_outside_window`** (bool, default `true`; `false` para Evolution). O gate de "digitar livre fora da janela 24h" no composer passou a ler essa flag do endpoint efetivo resolvido pela linha ativa — não mais hardcode `provider === 'evolution_api'`. Botão "digitar livre / migrar" e rota `migrateThreadAndSend` removidos do frontend.

Contrato consolidado a documentar em todos os lugares:
`business_context → purpose → messaging_lines.active_endpoint_id → communication_endpoint → requires_template_outside_window`
A thread guarda histórico (`primary_endpoint_id` = origem); a linha ativa define o número de envio. Nenhuma migração de thread é necessária ao trocar de provedor/número.

## Arquivos a atualizar

### 1. `docs/plans/2026-07-endpoint-lines-rotation.md`
Marcar **Status: Fase 0 implementada** (envio por linha ativa nas 3 send functions + composer neutro por capacidade). Adicionar seção curta "O que mudou desde o desenho":
- resolução de envio server-side agora vive nas próprias send functions (honram `endpointId` explícito) além do dispatcher;
- `requires_template_outside_window` é a evolução natural do gate de janela — substitui o teste por provider.

### 2. `docs/modules/messages/README.md` e `docs/modules/messages/data-model.md`
- Atualizar bullet de envio: `dispatchWhatsAppSend` resolve pela linha ativa (`messaging_lines.active_endpoint_id` por `purpose` derivado de `business_context`); send functions honram o `endpointId` explícito.
- Substituir menção a botão "digitar livre" / migração manual por: gate de janela 24h lê `requires_template_outside_window` do endpoint efetivo.
- Em `data-model.md`, documentar a coluna `requires_template_outside_window` em `communication_endpoints` (default `true`, `false` para Evolution) e o papel de `messaging_lines` / `messaging_line_rotations`.

### 3. `docs/modules/inbox/README.md`
Mesmo ajuste do item 2, escopo Atendimento (linha `customer_service`).

### 4. `docs/product/channel-boundaries.md`
Substituir a regra "sales → endpoint comercial" por descrição precisa: rota comercial vai pela **linha ativa comercial da org**, independente do provider do `primary_endpoint_id` histórico da thread. Idem para atendimento.

### 5. `docs/architecture/event-flow.md` (§3 Envio outbound)
Reescrever o bloco: dispatcher escolhe linha ativa por `business_context/purpose` → send function (Evolution/Meta/Twilio) valida endpoint explícito (org, provider, `is_active`) → envia. Fallback a `primary_endpoint_id` só quando nenhum `endpointId` vier no payload.

### 6. `docs/audit/02-edge-functions/meta-whatsapp-send.md`, `.../twilio-whatsapp-send.md`, `.../evolution-whatsapp-send.md` (se existir; senão criar entrada mínima)
Atualizar seção "Observações": remover descrição da trava "primary sempre vence"; documentar nova ordem (endpointId explícito > primary), validação (org + provider + is_active), e o log `line_routing_honored`.

### 7. `docs/integrations/evolution-api/ENDPOINT_PURPOSE_RULE.md`
Anexar nota curta: capacidade "envio livre fora da janela" agora é declarada por `communication_endpoints.requires_template_outside_window = false` (setado no provisionamento Evolution), não mais deduzida do provider no frontend.

### 8. `docs/integrations/evolution-api/PRODUCTION_READY_AUDIT.md` (ou UX_FINAL_AUDIT)
Nota de fechamento: dispatcher + send functions + composer alinhados; UX de migração manual desativada.

### 9. `docs/STATUS.md`
Uma linha datada 2026-07-22: roteamento por linha ativa restaurado (3 send functions), `requires_template_outside_window` em produção, migração manual de thread removida.

## Pendência conhecida a registrar (não implementar)

Inserts das edge functions Evolution que criam novos endpoints ainda não gravam `requires_template_outside_window = false` explicitamente — hoje depende do backfill inicial. Registrar como TODO em `ENDPOINT_PURPOSE_RULE.md` e em `PRODUCTION_READY_AUDIT.md`.

## Fora de escopo

- Nenhum código, migration, edge function ou teste.
- Nenhum arquivo novo de doc além do TODO acima (só edições nos existentes).
- Não mexer em `docs/inbox-v2/*`, mobile docs, nem auditorias históricas datadas.
