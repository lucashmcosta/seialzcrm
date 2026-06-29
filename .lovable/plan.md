## Diagnóstico (read-only)

### Fluxo atual da lista de templates quando a janela 24h expira

1. `/messages` (desktop: `src/pages/messages/MessagesList.tsx:1614-1620`; mobile: `src/components/mobile/MobileMessagesList.tsx:855-858`) renderiza `<WhatsAppTemplateSelector>` passando a prop:
   ```
   provider={selectedThreadWaProvider === 'meta_cloud_api' ? 'meta_cloud_api' : undefined}
   ```
2. `selectedThreadWaProvider` vem de `useWhatsAppProvider({ threadId })` (`src/hooks/useWhatsAppProvider.ts`), que:
   - lê `message_threads.primary_endpoint_id`;
   - lê `communication_endpoints.provider` desse endpoint;
   - retorna `'twilio' | 'meta_cloud_api' | null`.
3. `WhatsAppTemplateSelector.fetchTemplates` (`src/components/whatsapp/WhatsAppTemplateSelector.tsx:54-71`) decide o filtro:
   - `provider === 'meta_cloud_api'` → `eq('provider','meta_cloud_api')`;
   - **caso contrário (inclui `undefined`/`null`)** → `or('provider.is.null,provider.eq.twilio')` (default legado Twilio).
4. Os templates Meta da org existem e estão aprovados: query confirma **3 ativos `provider='meta_cloud_api'` status=`approved`** para `40ae935c-a7f7-4ad7-8ea4-91be6404a95f`.

### Causa raiz do bloqueio (Cheila)

- A thread da Cheila ainda tem `primary_endpoint_id` apontando para o endpoint Twilio (ou NULL) — o re-route do dispatcher é **lazy**: só persiste a migração no `meta-whatsapp-send` depois de um envio real.
- Logo `useWhatsAppProvider` devolve `'twilio'` (ou `null`).
- O seletor cai no ramo default e lista **só templates Twilio**.
- Usuário não consegue escolher template Meta → `meta-whatsapp-send` nunca é chamado → re-route nunca é exercitado → migração nunca persiste. Deadlock clássico.

### Onde existem filtros por provider

| Camada | Filtro |
|---|---|
| Banco | nenhum |
| Edge `twilio-whatsapp-templates` (sync) | apenas escreve `provider='twilio'` |
| Hook `useTemplates` (settings) | sem filtro de provider |
| **`WhatsAppTemplateSelector`** | filtro `or(provider.is.null, provider.eq.twilio)` no ramo default |
| `useWhatsAppProvider` | resolve a partir de `primary_endpoint_id` da thread |

Não há filtro `provider='twilio'` no Railway nem no banco — o problema é **só na resolução do provider no front quando a thread ainda não foi migrada**.

### Conclusão

A lista nunca seleciona "automaticamente o provider do endpoint que será efetivamente usado no envio". Ela usa o `primary_endpoint_id` atual da thread, que para qualquer thread alvo do re-route ainda é Twilio. Precisa antecipar a regra do re-route no front, **apenas para escolha do template**, sem alterar threads, endpoints, dispatcher ou backend.

---

## Plano de implementação (baixo risco)

### Objetivo
Quando o envio será re-roteado para Meta 7020 (mesma regra do dispatcher), listar **apenas templates Meta aprovados ativos**, para destravar o piloto sem alterar nada de persistência.

### Escopo
Front-end puro. Sem migrações, sem mudar edge functions, sem mudar `useWhatsAppProvider`, sem mexer em `/inbox`.

### Mudança 1 — novo helper `resolveComposerProvider`
Arquivo novo: `src/lib/resolveComposerProvider.ts`.

Recebe `{ organizationId, senderContext, resolvedProvider }` e retorna o provider efetivo para a UI do composer:
- Se `senderContext === 'messages'` **e** `organizationId === '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'` **e** `resolvedProvider` é `'twilio'` ou `null` → retorna `'meta_cloud_api'`.
- Caso contrário → retorna `resolvedProvider`.

Mesmas constantes do dispatcher cliente (`REROUTE_ORG_ID`), mantidas em arquivo único compartilhado para evitar drift. Idealmente extrair `REROUTE_ORG_ID` de `src/lib/dispatchWhatsAppSend.ts` para esse novo módulo e o dispatcher importa de lá.

### Mudança 2 — `MessagesList.tsx` (desktop)
Substituir:
```
provider={selectedThreadWaProvider === 'meta_cloud_api' ? 'meta_cloud_api' : undefined}
```
por algo equivalente a:
```
provider={resolveComposerProvider({
  organizationId: organization?.id,
  senderContext: 'messages',
  resolvedProvider: selectedThreadWaProvider,
}) ?? undefined}
```

### Mudança 3 — `MobileMessagesList.tsx`
Mesma substituição na linha 858.

### Mudança 4 — nenhuma alteração em `/inbox`
`InboxComposer` não é tocado. O helper só é chamado com `senderContext='messages'` no composer da tela Comercial.

### Mudança 5 — nenhuma mudança em `WhatsAppTemplateSelector`
O componente já filtra corretamente quando recebe `provider='meta_cloud_api'`.

### Comportamento esperado após o ajuste

| Cenário | Provider resolvido pelo hook | Provider passado ao selector | Lista exibida |
|---|---|---|---|
| Thread Cheila (Twilio legado, org alvo, tela messages) | `twilio` | `meta_cloud_api` | 3 templates Meta aprovados |
| Thread já 7020 (org alvo, messages) | `meta_cloud_api` | `meta_cloud_api` | Templates Meta |
| Thread Twilio outra org | `twilio` | `undefined` | Templates Twilio (legado) |
| `/inbox` CS qualquer org | qualquer | inalterado | Comportamento atual preservado |

### Validação (read-only + visual)
1. Conferir no DB: `whatsapp_templates` ativos+approved da org tem 3 Meta — já feito.
2. Abrir thread Cheila em `/messages` fora da janela 24h → lista deve mostrar somente templates Meta.
3. Abrir uma thread `/inbox` CS → continua mostrando templates Twilio (sem regressão).
4. Selecionar e enviar um template Meta na thread Cheila → expectativa: `meta-whatsapp-send` é chamado, dispatcher já fará o re-route (provider final passa a `meta_cloud_api` pelo caminho `endpoint_explicit` ou pelo gate de re-rota), `migration_applied=true`, nota interna criada.

### Riscos e mitigação
- **Risco:** mudar a lista para Meta em uma org que ainda não tem templates Meta → lista vazia. **Mitigação:** o gate exige `REROUTE_ORG_ID` específico (Central Trabalhista), que comprovadamente tem 3 templates Meta aprovados.
- **Risco:** `senderContext` errado em outra tela → nenhum, helper só é chamado nas duas telas `/messages`.
- **Sem risco** para `/inbox`, threads de outras orgs, ou threads já em 7020.

### Fora de escopo
- Não migrar `primary_endpoint_id` aqui.
- Não tocar em `useWhatsAppProvider` (continua refletindo o estado real do banco).
- Não alterar `communication_endpoints.purpose`.
- Não mudar edge functions nem schema.