# Diagnóstico — lixeira da tela Evolution WhatsApp (read-only)

Nada foi alterado. Abaixo o resultado da auditoria, item por item.

## Causa raiz

A instância clicada **não existe mais no servidor Evolution**. O `DELETE /instance/delete/{name}` responde **404**, e nosso cliente traduz qualquer 4xx para o código genérico `UPSTREAM_4XX`. O handler `deleteInstance` só tolera o código `EVOLUTION_NOT_FOUND` — que **nunca é produzido** pelo cliente. Resultado: devolvemos `502 UPSTREAM_4XX`, o registro em `evolution_instances` nunca é apagado e a linha fica órfã de forma permanente (a UI exibe apenas "Edge Function returned a non-2xx status code").

Ou seja: o problema está no **nosso backend** (mapeamento de erro incompatível), não na Evolution API — a Evolution está apenas informando corretamente que a instância não existe.

## Respostas

1. Edge Function: `sales-route-operations`, op `deleteInstance` (chamada por `useDeleteEvolutionInstance`).
2. Não há exceção lançada; é um retorno de erro explícito após o upstream falhar.
3. `supabase/functions/sales-route-operations/index.ts` — bloco `case "deleteInstance"`, no `if (del !== true && (del as {code?:string}).code !== "EVOLUTION_NOT_FOUND")` que responde `json(502, ...)`. O código `UPSTREAM_4XX` é gerado em `supabase/functions/_shared/evolution/client.ts:117`.
4. HTTP status retornado ao frontend: **502**.
5. Mensagem completa: `{"error":"UPSTREAM_4XX"}`; upstream logado como `{"fn":"evolution-instance-manager","op":"delete","status":404,"code":"UPSTREAM_4XX","message":"upstream non-2xx"}` (log 2026-08-14 23:14:37Z).
6. Não há FK nem constraint bloqueando. A trava de negócio (`EVOLUTION_INSTANCE_IN_USE`) **não** disparou: nenhuma Route ativa usa esses endpoints (`active_endpoint_id` = 0 ocorrências).
7. Sim, ambas as instâncias têm endpoint comercial vinculado (`dev-int` → `+5511936198439`; `evo-…628b2eab` → `+551150287020`), com 1 link de elegibilidade cada — mas nenhum é o número ativo de uma Route. O fluxo já preserva o endpoint na exclusão.
8. Webhook: não é consultado nem removido no fluxo de delete; como a instância não existe mais no servidor, não há webhook ativo do lado da Evolution.
9. Sessão: `dev-int` está `close` (checada 17:10Z) e `evo-…628b2eab` está `open` (23:15Z). A sessão local é só um espelho de estado; não impede exclusão.
10. Sim — a exclusão deve funcionar mesmo desconectada, e também quando a instância já não existe upstream (404 é caso idempotente de sucesso).
11. Nosso backend.

## Correção mínima proposta (não aplicada)

Tratar 404 do upstream como sucesso idempotente no `deleteInstance`: aceitar `del.status === 404` (além de `EVOLUTION_NOT_FOUND`), seguir com a remoção da linha em `evolution_instances`, preservando endpoint e histórico. Opcionalmente, propagar no cliente um código semântico `EVOLUTION_NOT_FOUND` quando `status === 404` em ops de instância, e exibir o erro real no toast em vez do texto genérico.

Nenhuma dessas mudanças foi feita — aguardo autorização.
