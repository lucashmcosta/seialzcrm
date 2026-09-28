# Evolution pedindo template: auditoria do envio real + correções 1 e 2

## Parte A — Auditoria somente leitura do envio (conversa Denise)
Thread `ec86ff7b…`, Central, `business_context = sales`. Últimas mensagens válidas: todas pelo Evolution `3ed219e0…` (inbound 16/09, outbound 17/09). Flag `sales_manual_reply_endpoint_v1` ligada na Central. Os dois números, Evolution `3ed219e0` e Meta `bf04ce63`, estão vinculados à rota Comercial.

Caminho real: `useManualReplyEndpoint` gera `replyEndpointSelection`. Com a flag ligada, `dispatchWhatsAppSend` (cliente) chama direto a edge function `dispatch-whatsapp-send`. No servidor, `_shared/dispatch-whatsapp-send.ts` → `resolveProvider` escolhe a função `evolution-` ou `meta-whatsapp-send`. O `endpointId` enviado pela tela (`composerEndpointId`) é só uma dica e o servidor o sobrescreve nesses dois caminhos.

| Situação | Número mostrado ("Responder por") | Número avaliado pelo Composer (bloqueio) | Número mandado ao envio | Provedor chamado de fato |
|---|---|---|---|---|
| Sem seleção manual | Evolution 7020 (última mensagem) | Meta 7067 (linha ativa, via `useThreadSendEndpoint`) | `derived` + dica Meta 7067 | **Evolution** (o servidor consulta de novo a última mensagem válida, que é a 3ed219e0) |
| Manual: Evolution 7020 | Evolution 7020 | Meta 7067 | `manual` 3ed219e0 | **Evolution** |
| Manual: Meta 7067 | Meta 7067 | Meta 7067 | `manual` bf04ce63 | **Meta** |

O bloqueio de template nunca muda com o "Responder por": ele sempre olha a linha ativa (Meta). Nos casos 1 e 2 o campo bloqueia, mas a mensagem sairia pelo Evolution. Isso confirma que a tela avalia um número diferente do que o envio usa. Mesmo que o bloqueio olhasse o número certo, hoje ele também pediria template, porque o Evolution está com `true` (itens 1 e 2).

### Prioridade usada hoje (sem alterar)
- **Envio** (servidor, flag ligada): (1) seleção manual em "Responder por", revalidada; (2) número da última mensagem válida, se estiver vinculado à rota e for elegível; (3) número padrão da rota; (4) se nada disso resolver, `REPLY_ROUTE_UNRESOLVED` e o envio é bloqueado. `messaging_lines.active_endpoint_id` e `thread.primary_endpoint_id` não entram nesse caminho.
- **Bloqueio do Composer**: `useThreadSendEndpoint` usa (1) `messaging_lines.active_endpoint_id`, se estiver ativo, e (2) `thread.primary_endpoint_id`, se estiver ativo. Ignora a seleção manual e a última mensagem.
- **Envio legado** (flag desligada, fora da Central): o `endpointId` da tela, depois a linha ativa, depois o primary.

## Parte B — Implementar agora (aprovado)
1. **Criação de números:** `provision_line_endpoint_core` e `provision_sales_endpoint` passam a gravar a capacidade no INSERT, a partir do provedor já resolvido: `evolution_api` recebe `false`; `meta_cloud_api`, `meta_cloud_api_coexistence` e `twilio` recebem `true`; qualquer outro provedor recebe `true` (continua bloqueado). A lógica das funções fica igual e o padrão da coluna não muda.
2. **Dados:** mudar para `false` somente `3ed219e0…` (Central) e `43cca41d…` (org `689f30e5`), mostrando o antes e o depois.
3. Registrar no `roadmap.md` e fechar o [TODO] em `docs/integrations/evolution-api/ENDPOINT_PURPOSE_RULE.md`.

## Parte C — Proposta do item 3 (não implementar ainda)
O Composer passa a avaliar o mesmo número que aparece no "Responder por". Esse número já segue a regra do servidor: primeiro a escolha manual, depois a última mensagem válida, depois o padrão da rota. A regra vem de `deriveSelectedEndpoint` em `src/lib/replyEndpointSelection.ts`, que espelha o `_shared/reply-endpoint-selection.ts`, então não surge uma segunda regra.
- Criar uma função única em `src/lib/composerEndpoint.ts`, `resolveComposerCapability({ manualReply, sendEp, endpointById })`, que devolve `{ endpointId, requiresTemplateOutsideWindow }`:
  - com o "Responder por" ativo: usa `manualReply.selectedEndpointId` e lê `requires_template_outside_window` desse número (já vem em `useOrgWhatsAppEndpoints`);
  - com o "Responder por" desligado: mantém `useThreadSendEndpoint` (caminho legado igual a hoje);
  - se o seletor ainda está carregando, se o número não foi resolvido ou se a flag não foi lida: `true` (continua bloqueado).
- `composerAllowsFreeformOutsideWindow` passa a vir só dessa função. Não há checagem de provedor no Composer.
- Ao trocar o "Responder por", a decisão muda na hora, porque é calculada a partir do estado do seletor.
- [INCERTO] Deixar o `composerEndpointId` (a dica do envio e o escopo dos templates) apontando para o mesmo número. Isso muda os templates listados e fica como decisão separada.

## Verificação (depois de B)
- Consulta: os dois números Evolution com `false`, o Meta 7067 continua `true`, o piloto não muda.
- Conferir a definição das duas funções no banco: elas gravam a flag de forma explícita.
