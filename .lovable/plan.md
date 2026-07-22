
## Objetivo

Remover do frontend a decisão baseada em provider (`provider === 'evolution_api'`) para liberar texto livre fora da janela 24h. Passar essa capacidade para o **endpoint efetivo de envio**, via nova coluna booleana em `communication_endpoints`.

## Regra de negócio (nova, única fonte)

Composer libera texto livre fora da janela 24h ⇔ o **endpoint efetivo de envio** (resolvido por `messaging_lines.active_endpoint_id` do purpose) tem `requires_template_outside_window = false`.

Sem exceção por provider. Twilio/Meta ficam `true` (default). Evolution fica `false` via backfill. Qualquer novo provider é configurável no cadastro do endpoint.

**Regra dura**: `requires_template_outside_window` **nunca participa da escolha do endpoint**. A ordem de resolução permanece:

```text
business_context
   ↓
purpose
   ↓
messaging_lines.active_endpoint_id
   ↓
communication_endpoint
   ↓
requires_template_outside_window   ← só é lido depois de resolver
```

Nunca "procurar endpoint onde `requires_template_outside_window = false`".

## Mudanças propostas

### 1. Banco — `communication_endpoints`

Novo campo:

```text
requires_template_outside_window boolean NOT NULL DEFAULT true
```

Backfill único na mesma migration:

- `UPDATE ... SET requires_template_outside_window = false WHERE provider = 'evolution_api';`
- Demais linhas ficam `true` pelo DEFAULT.

Sem alteração em RLS/GRANT (coluna adicionada à tabela existente).

### 2. Hook `useThreadSendEndpoint` — única fonte de verdade

Adicionar `requiresTemplateOutsideWindow: boolean` ao retorno (`ThreadSendEndpoint`), lido junto com os demais campos do endpoint efetivo (o que já é resolvido por linha ativa hoje). Default seguro `true` quando o endpoint não puder ser resolvido.

Todo consumidor (composer, gate de janela, banner) deve ler **exclusivamente** `sendEndpoint.requiresTemplateOutsideWindow`. Nenhum outro hook ou componente calcula essa capacidade por conta própria.

### 3. `MessagesList.tsx` — remover hardcodes de `evolution_api`

- **Linha 669** (varredura `evolutionEndpoint` para override de composer): **remover**. Esse override existia para forçar o composer a apontar para Evolution em threads Meta/Twilio antigas — hoje isso já é feito automaticamente pelo dispatcher/`useThreadSendEndpoint` via linha ativa. Sem substituto: o composer usa o endpoint resolvido pela linha; ponto.
- **Linha 702** (`composerIsEvolution`): renomear para `composerAllowsFreeformOutsideWindow`, derivado de `sendEndpoint.requiresTemplateOutsideWindow === false`.
- **Linhas 705/713/715/1180** (`canBypassWindow`, `shouldMigrate`, evolutionEndpoint na org): trocar toda a lógica de "existe Evolution na org" pela flag do endpoint efetivo. O fluxo `shouldMigrate` deixa de existir como caminho especial — se a linha ativa aponta pra endpoint que não exige template, envio livre; se não, gate de template normal.
- **Linhas 2387–2453** (gate `outOfWindow` + banner):
  - `composerBypassesWindow = composerAllowsFreeformOutsideWindow`.
  - Copy: "Envio livre pelo número ••••{last4}" (neutro, sem citar provider).

### 4. `useOrgWhatsAppEndpoints` — expor a flag no tipo

Adicionar `requires_template_outside_window: boolean` ao `select` e ao tipo `OrgEndpoint`. Não é consumido por lógica de seleção; apenas fica disponível para telas de admin/diagnóstico eventuais.

### 5. Escopo intencionalmente fora deste plano

- **Servidor** (`_shared/dispatch-whatsapp-send.ts`, `meta-whatsapp-send`, `twilio-whatsapp-send`): não muda. Compliance de janela no backend continua igual — provider rejeita se aplicável. A flag é puramente **capacidade declarada** consumida pela UI.
- **UI de admin** para editar a flag por endpoint: fora. Backfill cobre existentes.
- **Provisionamento Evolution** (`evolution-*` edge functions): inserts de novos endpoints precisam gravar `requires_template_outside_window = false` explicitamente, senão caem no DEFAULT `true` e o composer bloqueia. Item pequeno mas obrigatório — **confirmar se entra no mesmo PR** (recomendo sim, se não vira dívida silenciosa).
- **Dispatcher/roteamento por linha**: intocado.
- **Inbox** (`/inbox`): não usa esse gate; nada a alterar.

## Arquivos afetados

- 1 migration (schema + backfill).
- `src/hooks/useThreadSendEndpoint.ts` — expor flag.
- `src/hooks/useOrgWhatsAppEndpoints.ts` — select + tipo.
- `src/pages/messages/MessagesList.tsx` — remover 3 hardcodes + copy neutra.
- (Opcional/recomendado) inserts nas edge functions de provisionamento Evolution.

## Riscos / pontos a validar antes de codar

1. **Copy do banner** — hoje: "pelo Evolution ••••8439". Proposta: "pelo número ••••8439". Confirmar se você quer 100% neutro ou manter menção ao provider como texto informativo (nesse caso, ler `sendEndpoint.provider` só para exibição — nunca para lógica).
2. **Inserts de provisionamento Evolution** — incluir a flag `false` no mesmo PR? Se ficar fora, novos números Evolution vão bloquear composer até ajuste manual.
3. **Threads legadas Twilio/Meta** — permanecem `true`; comportamento idêntico ao atual, sem regressão esperada.
