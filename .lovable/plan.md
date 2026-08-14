# Auditoria — "Responder por" (Comercial)

Somente leitura. Nada implementado nesta etapa.

## 1. Fluxo atual

- UI: `src/components/messages/route/ManualReplySelector.tsx`, consumido em `src/pages/messages/MessagesList.tsx` (composer).
- Estado/hook: `src/hooks/messages/useManualReplyEndpoint.ts` (opções, preferência, mutações) + `src/hooks/messages/useSalesFeatureFlags.ts` (flag lida na mesma query do resolver V2 — nenhuma query extra com a feature OFF).
- Persistência: RPC `set_thread_reply_endpoint_pref` grava em `thread_reply_endpoint_prefs` (chave thread + usuário); `clear_thread_reply_endpoint_pref` remove (volta a Automático).
- Envio: `MessagesList` injeta `manualReplyEndpointId` nos 3 pontos de envio (texto, mídia, template). O dispatcher cliente (`src/lib/dispatchWhatsAppSend.ts`) e o servidor (`supabase/functions/_shared/dispatch-whatsapp-send.ts`) revalidam e escolhem o provider antes de rotear. Cada function de provider (`meta-whatsapp-send`, `twilio-whatsapp-send`, `evolution-whatsapp-send`) revalida com `resolveManualReplyEndpoint` e substitui apenas o endpoint efetivo.

## 2. Backend

- Route intocada: nenhuma escrita em `messaging_lines`, `messaging_line_endpoints` ou `messaging_line_rotations` no caminho do switch. CONFIRMADO.
- `active_endpoint_id` nunca alterado — apenas lido pelo caminho automático. CONFIRMADO.
- Efeito limitado à mensagem enviada: o override troca `endpointId`/provider do envio; `primary_endpoint_id` e a Route seguem iguais. CONFIRMADO.
- Resolver V2 intacto: `resolveSalesReplyRoute` só é chamado quando não há override manual válido; sem override o comportamento é byte-a-byte o atual. CONFIRMADO.

## 3. Modo Manual

Funciona ponta a ponta no código: validação fail-closed server-side (flag, thread Comercial canônica via `fn_is_canonical_sales_thread`, permissão explícita em `user_reply_endpoints`, elegibilidade via `fn_is_sales_eligible_endpoint`, org/canal/ativo, e para Evolution sessão `open` + identidade confirmada), precedência sobre V2 e sobre a re-rota automática da Central (Meta 7020). Falta apenas validação real de envio Manual em produção fora da Viagi (Evolution não pôde ser testado por falta de acesso ao aparelho).

## 4. Modo Automático

Sem `manualReplyEndpointId` no payload há short-circuit imediato (`{ mode: "auto" }`), sem query nova. Voltar para Automático apaga a preferência via `clear_thread_reply_endpoint_pref`, restaurando 100% o fluxo anterior. CONFIRMADO.

## 5. Permissões

- `user_reply_endpoints` e `thread_reply_endpoint_prefs`: RLS ON, `GRANT SELECT` a `authenticated`, `ALL` a `service_role`; política de leitura restrita a `current_user_id()` ou gestor da org. Escrita só via RPCs `SECURITY DEFINER` com `EXECUTE` para `authenticated`. Nenhum grant pendente.
- Concessão de números a usuários existe apenas como RPC (`grant_user_reply_endpoint` / `revoke_user_reply_endpoint`) — **não há tela de administração**. Hoje só é possível conceder via SQL.
- Estado real: 2 concessões (piloto Viagi), 0 concessões na Central.

## 6. Auditoria da escolha

`replyChoiceMetadata()` grava `reply_endpoint_choice`, `manual_reply_endpoint_id` e `chosen_by_user_id` no `metadata` da mensagem nos três providers (Meta linha 808, Twilio 962, Evolution 459). CONFIRMADO — nada faltando.

## 7. Realtime / histórico

O switch não altera hooks de realtime, mensagens otimistas, paginação ou consultas de histórico; só adiciona um campo no payload de envio. CONFIRMADO.

## 8. Riscos para piloto na Central

1. Sem UI de concessão: nenhum usuário da Central pode escolher número sem SQL manual.
2. Flag `sales_manual_reply_endpoint_v1` está ON apenas para a Viagi (correto, mas é um passo pendente).
3. A linha Comercial da Central tem só 2 endpoints vinculados (7067 ativo e 7020); os demais números Twilio da org são `purpose=other` e não são elegíveis — o seletor mostrará poucas opções.
4. Central roda com resolver V2 OFF: em modo Automático nada muda, mas convive com a re-rota legada Meta 7020, que o override desliga — precisa ser conferido em envio real.
5. Envio real Manual por Evolution nunca validado (bloqueio operacional, não de código).
6. Build assíncrono atual falhou no `bun install` (cache corrompido de `@sentry/browser`) — não é da feature, mas impede validar build antes do piloto.

## 9. Veredito

❌ Ainda faltam 3 itens para piloto seguro na Central:

1. Tela de administração de números por usuário (chamando `grant_user_reply_endpoint` / `revoke_user_reply_endpoint`) — sugerido em `src/components/settings/SalesWhatsAppSettingsSection.tsx` com hook novo em `src/hooks/`.
2. Habilitar `sales_manual_reply_endpoint_v1` para a org da Central (`feature_flags.organization_ids`) — operação de dados, após o item 1.
3. Teste real de envio Manual (Meta 7067 e 7020) por um usuário da Central, com verificação do `metadata.reply_endpoint_choice` na mensagem gravada.

Correção paralela recomendada: reinstalar dependências para sanar o `bun install` (cache de `@sentry/browser`) antes do piloto.
