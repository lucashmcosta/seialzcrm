# Corrigir “Responder por” stale após nova mensagem

## Diagnóstico confirmado

- **Módulo afetado:** Messages/Comercial. Atendimento fica fora do escopo por ADR-0009.
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, `docs/modules/messages/{README,data-model}.md`, `docs/operations/conflicts.md`, drift ativo e ADR-0009.
- **Banco/RLS/Routes:** nenhuma mudança de schema, dados, RLS, Route, `active_endpoint_id` ou rotações.
- **Edge Functions:** somente o caminho de despacho Comercial precisa ser corrigido para tornar o servidor a autoridade real.
- **Integrações externas:** Meta/Evolution continuam com seus senders atuais; não há alteração de credenciais ou configuração.
- **Multi-tenancy:** manter validações de organização, thread Comercial e endpoint elegível já existentes.

### Evidência da thread João Teste

Thread `9c158663-a1d0-4ae8-a983-0c9653148c0e`:

1. Inbound Evolution que deveria ter definido a resposta:
   - `id=f8dacf9c-4d4f-4b38-b620-1af8a5951656`
   - `direction=inbound`
   - `sent_at=2026-08-14 20:22:35+00`
   - `created_at=2026-08-14 20:22:36.338288+00`
   - `endpoint_id=3ed219e0-b919-4a1f-b2f6-6806cfafe6f7`
   - `provider=evolution_api` / 7020
2. Outbound posterior incorreta:
   - `id=8bf6fcc7-e5e7-418e-a692-0e28e2012855`
   - `direction=outbound`
   - `endpoint_id=bf04ce63-d310-4c16-a133-b373a40df340`
   - `provider=meta_cloud_api` / 7067

O payload registrado pelo Meta foi:

```text
replyEndpointSelection = { source: "derived", endpointId: "bf04ce63-..." }
endpointId = "bf04ce63-..."
```

Portanto, a seleção não estava manual. O registro legado em `thread_reply_endpoint_prefs` ainda aponta para 7067, mas o hook atual não consulta essa tabela e ele não causou este envio.

### Causas raiz

1. **UI:** o callback realtime adiciona a mensagem à timeline, mas não chama `invalidateThreadLastEndpoint`. Assim, a query React Query permanece com o endpoint anterior; não há refetch após o inbound.
2. **Estado manual transitório:** `manualByThread` persiste até ação explícita “seguir última mensagem”; hoje uma nova mensagem não o limpa e um envio manual concluído também não volta garantidamente para `derived`.
3. **Autoridade server-side inexistente nesse fluxo:** `src/lib/dispatchWhatsAppSend.ts` chama diretamente o sender do provider. `meta-whatsapp-send` recebeu um `endpointId` já resolvido como 7067 e não executa `route-resolver` para seleção `derived`.
4. **Flag incompatível com o contrato aprovado:** `conv_route_resolver_v2` está habilitada apenas para a Viagi, não para a Central. No cliente, `resolveSalesReplyRoute` retorna `flag_off`, preservando o `composerEndpointId` 7067.
5. **Ordenação:** hook, resolver cliente e resolver server-side já usam o mesmo critério correto: `sent_at DESC NULLS LAST, created_at DESC`. O fallback legado em `resolveProvider` usa somente `created_at`, mas não deve participar do novo caminho `derived`.

## Correção mínima

### 1. Atualização imediata da UI

- Invalidar `thread-last-endpoint` em todo `INSERT`/`UPDATE` realtime relevante da thread ativa.
- Fazer `useThreadLastEndpoint` retornar também a identidade da última mensagem (`id`, direção e timestamps), mantendo a mesma ordenação do backend.
- Ao mudar a identidade da última mensagem válida, limpar qualquer seleção manual transitória da thread e voltar para `selectionSource='derived'`.
- Após um envio manual persistido com sucesso, limpar explicitamente o estado manual; a outbound recém-criada passa a ser a última mensagem e sustenta visualmente o mesmo número, agora como `derived`.

### 2. Backend como fonte de verdade real

- Criar o endpoint server-side fino `dispatch-whatsapp-send`, reutilizando o dispatcher compartilhado já existente.
- Fazer o frontend enviar o payload para esse dispatcher, em vez de escolher e chamar Meta/Evolution/Twilio diretamente.
- Para payload explícito `{ source: 'derived' }`, o dispatcher server-side reconsulta a última mensagem válida no instante do envio e ignora o `endpointId`-hint da UI.
- Aplicar o contrato derived para organizações com o seletor habilitado, sem depender da antiga flag de rollout `conv_route_resolver_v2`; manter os gates de thread Comercial/WhatsApp, mesma organização, link Comercial ativo, endpoint ativo e provider suportado.
- Para `{ source: 'manual' }`, manter uso exato e fail-closed do endpoint escolhido.
- Os senders de provider continuam recebendo um `endpointId` server-side já validado; nenhum deles altera Route ou rotação.

### 3. Eliminar precedências antigas no novo caminho

- No caminho `derived`, impedir participação de `composerEndpointId`, `manualReplyEndpointId`, `thread_reply_endpoint_prefs`, `primary_endpoint_id` e `active_endpoint_id` quando existe mensagem válida.
- Manter `active_endpoint_id` somente como fallback temporário para thread sem qualquer mensagem válida com `endpoint_id`.
- Não apagar nem alterar a preferência legada existente no banco; apenas garantir que ela não seja lida pelo contrato novo.

## Testes e validação

- Teste de regressão obrigatório:
  1. última outbound 7067 → UI derived 7067;
  2. inserir/simular realtime de inbound 7020;
  3. confirmar refetch imediato, UI 7020 e `selectionSource='derived'`;
  4. enviar com hint stale 7067;
  5. confirmar que o servidor resolve Evolution 7020.
- Testar manual transitório:
  - clique manual → um envio manual;
  - outbound persistida → estado volta a derived;
  - inbound posterior, inclusive no mesmo endpoint manual, cancela o estado manual.
- Testar ordenação idêntica UI/backend em empate de `sent_at`, usando `created_at` como desempate.
- Testar que thread sem mensagem válida ainda usa Route default.
- Rodar testes direcionados do dispatcher/resolver, testes frontend do hook/estado e validação TypeScript.
- Validar em preview o cenário João Teste sem executar envio real durante a automação.

## Pós-condições obrigatórias

```text
ACTIVE_ENDPOINT_CHANGED=NO
ROUTES_CHANGED=NO
MESSAGING_LINE_ROTATIONS_NEW=0
META_7067_CHANGED=NO
META_HISTORICAL_7020_CHANGED=NO
ATENDIMENTO_CHANGED=NO
```
