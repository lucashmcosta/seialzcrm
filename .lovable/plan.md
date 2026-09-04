# Auditoria: seletor "Responder por" (Comercial) e como levar ao mobile

Tudo abaixo foi conferido no banco e no código do web.

## 1. Provedores existentes hoje

`communication_endpoints.provider` (valores em uso agora):

| provider | canal | purpose | ativos |
|---|---|---|---|
| `meta_cloud_api` | whatsapp | commercial / customer_service | 4 |
| `evolution_api` | whatsapp | commercial | 2 |
| `twilio` | whatsapp | other / commercial | 14 |
| `seialz` | webchat | commercial | 2 |

Ou seja: o nome do provedor novo é **`evolution_api`** (rótulo "Evolution" na UI). Seu schema local está desatualizado.

## 2. Função de envio do provedor novo

Sim: **`evolution-whatsapp-send`**, ao lado de `meta-whatsapp-send` e `twilio-whatsapp-send`. Mas o caminho recomendado **não é** escolher a função no cliente: existe a edge function **`dispatch-whatsapp-send`**, que recebe um payload único (`organizationId`, `threadId`/`contactId`, `message`, mídia, `replyEndpointSelection`, etc.), valida a autenticação e a organização e roteia para o provedor certo. É esse o alvo do mobile — some a lógica de "twilio ou meta" no app.

Observação: templates aprovados da Meta não são suportados no Evolution (erro `templates_not_supported_on_evolution`).

## 3. Quais números aparecem no dropdown

Não são todos os endpoints da organização. A regra atual:

1. `communication_endpoints` da org com `channel = 'whatsapp'` e `is_active = true`;
2. cada candidato passa pela função de servidor `fn_is_sales_eligible_endpoint` (elegibilidade **Comercial**) — atendimento fica fora;
3. cada candidato passa por `fn_can_user_use_reply_endpoint` para o usuário logado — números **pessoais** (`purpose = 'vendor_personal'`) só são usáveis pelo dono; os demais aparecem com cadeado e "bloqueado" (fail-closed);
4. rótulo: `••••<4 dígitos> · <Provedor>` ou `••••<4 dígitos> · Pessoal · <dono>`.

## 4. Semântica da escolha

É **override pontual**, não mudança permanente:

- a escolha vale para a conversa aberta, em memória (por thread, na sessão);
- **nunca** altera `primary_endpoint_id`, `messaging_lines.active_endpoint_id` nem grava rotação;
- ao chegar uma nova mensagem válida na conversa, a escolha manual é descartada e a seleção volta a seguir a última mensagem;
- o envio manda `replyEndpointSelection = { source: 'manual', endpointId }` e o backend revalida (fail-closed).

## 5. Valor pré-selecionado

Não existe item "Automático". A ordem é:

1. escolha manual do operador nesta conversa, se houver;
2. senão, o endpoint da **última mensagem válida** da conversa (inbound ou outbound, não deletada, não nota interna) — enviado como `{ source: 'derived' }`, e o backend reconsulta essa mensagem na hora do envio;
3. senão (conversa sem mensagem roteável), o default da Route (`messaging_lines.active_endpoint_id`).

## 6. Onde está no web

- UI: `src/components/messages/route/ManualReplySelector.tsx`
- Estado/regras: `src/hooks/messages/useManualReplyEndpoint.ts` (+ `useThreadLastEndpoint.ts`, `useSalesFeatureFlags.ts`)
- Helpers puros: `src/lib/manualReplySelection.ts`, `src/lib/replyEndpointSelection.ts`
- Uso: `src/pages/messages/MessagesList.tsx`
- Espelhos de backend: `supabase/functions/_shared/reply-endpoint-selection.ts` e `_shared/manual-reply-endpoint.ts`

Feature flag: **`sales_manual_reply_endpoint_v1`**, hoje ligada para duas organizações (não é global).

## 7. Atendimento

É **exclusivo do Comercial** por decisão de produto: fora do escopo comercial o hook devolve `disabled` e o seletor não renderiza. No Atendimento o número sai da linha ativa de atendimento; se quiserem algo equivalente lá, é uma discussão de produto separada (ADR-0009 mantém os módulos separados).

---

## Plano para o mobile

**Fase 1 — trocar o envio pelo dispatcher (independente da UI)**
Substituir em `src/lib/dispatchWhatsAppSend.ts` do app a escolha manual entre `twilio-whatsapp-send`/`meta-whatsapp-send` por uma chamada a `dispatch-whatsapp-send`, sem `replyEndpointSelection`. Ganho imediato: passa a funcionar com Evolution e com qualquer provedor futuro. Nenhuma mudança de UI.

**Fase 2 — seletor "Responder por" no composer do app**
Portar a lógica, sem reimplementar regra:
- listar endpoints WhatsApp ativos da org e filtrar por `fn_is_sales_eligible_endpoint` e `fn_can_user_use_reply_endpoint` (as duas já existem no banco);
- seleção derivada pela última mensagem válida da conversa, com override manual por thread em memória e reset ao chegar mensagem nova;
- enviar `replyEndpointSelection` no payload do dispatcher;
- respeitar a flag `sales_manual_reply_endpoint_v1` (sem ela, o app segue no comportamento derivado do backend);
- bloquear apenas o **composer** quando o número selecionado não for permitido, com o texto "Escolha um número permitido para responder" — histórico e contexto continuam visíveis.

Reaproveitamento: os helpers puros `manualReplySelection.ts` e `replyEndpointSelection.ts` podem ser copiados sem alteração para o app (não dependem de React nem do Supabase).

**Fase 3 (opcional)** — reduzir os round-trips: hoje o web faz uma chamada de RPC por endpoint para elegibilidade e permissão. No mobile vale avaliar uma RPC única que devolva a lista já filtrada. Isso exige migração e fica para depois da paridade.

Também vou registrar estas fases no `roadmap.md` junto com as duas migrações de RPC do mobile (Mensagens e Início) já levantadas antes.

Nada aqui altera banco, RLS, permissões ou a versão web.
