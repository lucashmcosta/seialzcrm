# "Responder por" — Conclusão reclassificada + resposta sobre `active_endpoint_id`

## A. Resposta objetiva

**SIM — existe um único cenário residual, estreito, e ele é corrigível com uma mudança mínima.**

Por que o override manual normalmente prevalece até o provider:

1. O dispatcher (cliente e servidor) chama `resolveManualReplyEndpoint` **antes** de qualquer resolução de linha/V2; com `mode === "manual"` ele fixa o provider e o `endpointId` e não consulta `messaging_lines`.
2. Na function do provider o override é revalidado e grava `explicitEndpointId`; o `thread.primary_endpoint_id` divergente **apenas gera log** (`line_routing_honored`), não sobrescreve.
3. O fallback purpose-aware (que escolheria outro número) só roda quando `endpoint === null`, o que não ocorre no modo Manual.
4. A re-rota Comercial → Meta 7020 é **pós-envio** (persistência de thread), não escolhe o remetente.

O cenário residual (mesma estrutura nos três providers — Meta l.294-324, Evolution l.~300-320, Twilio l.~540-560):

- Se, **entre a validação e o envio**, o endpoint escolhido manualmente ficar `is_active = false` (número desconectado/rotacionado nesse intervalo, ou desativado por outro operador), o bloco de "rotação por linha" troca o remetente para `messaging_lines.active_endpoint_id` da Route e envia por ele — silenciosamente, contrariando a escolha manual.
- Probabilidade baixa (janela de milissegundos ou desativação concorrente), impacto: mensagem sai por número diferente do escolhido, com `metadata.reply_endpoint_choice = manual` apontando outro endpoint.

Correção mínima proposta (1 linha de guarda por provider): quando `manualReply.mode === "manual"`, **não** aplicar a rotação por linha; retornar erro `MANUAL_REPLY_ENDPOINT_INACTIVE` (fail-closed) para o operador escolher outro número ou voltar ao Automático.

## B. Conclusão reclassificada

### Bloqueadores do piloto na Central

1. Habilitar `sales_manual_reply_endpoint_v1` para a org da Central (`40ae935c-a7f7-4ad7-8ea4-91be6404a95f`).
2. Conceder endpoints aos usuários piloto via RPC/SQL (`grant_user_reply_endpoint`) — Meta 7067 (`bf04ce63…`) e Meta 7020 (`407ff93d…`), os dois únicos endpoints vinculados à linha Comercial da Central.
3. Validar envio real: Manual → 7067; Manual → 7020; volta para Automático; conferir `metadata.reply_endpoint_choice`, `manual_reply_endpoint_id` e `chosen_by_user_id` nas mensagens gravadas.
4. Aplicar a guarda anti-rotação descrita em (A) antes de ligar a flag — é curta e evita envio pelo número errado.

### Melhorias pós-piloto

- Tela administrativa de grant/revoke de endpoints por usuário (hoje só via RPC/SQL).
- Ajustes de UX do seletor.
- Demais refinamentos (rótulos, tooltips, estados vazios).

## C. Detalhes técnicos da guarda (item 4)

Arquivos: `supabase/functions/meta-whatsapp-send/index.ts`, `supabase/functions/twilio-whatsapp-send/index.ts`, `supabase/functions/evolution-whatsapp-send/index.ts`.

No bloco `if (endpoint && endpoint.is_active === false) { … }`, adicionar no topo: se `manualReply.mode === "manual"`, retornar 409 `MANUAL_REPLY_ENDPOINT_INACTIVE` com mensagem ao operador, sem consultar `messaging_lines`. Nenhuma mudança no caminho Automático, na Route, em flags ou no schema.

## D. Confirmado na auditoria (sem pendência)

- Route, `active_endpoint_id`, `messaging_line_rotations` nunca escritos pelo switch.
- Resolver V2 e modo Automático byte-a-byte inalterados sem override.
- RLS/grants completos em `user_reply_endpoints` e `thread_reply_endpoint_prefs`; escrita só por RPC `SECURITY DEFINER`.
- Auditoria de escolha persistida nos três providers.
- Realtime, paginação e histórico intocados.
