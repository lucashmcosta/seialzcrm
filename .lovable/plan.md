# Fase 0.2 — Edição Evolution: teste ponta a ponta e janela de edição

Somente diagnóstico. Sem migration, sem UI, sem handler. Configuração do webhook da 7020 não é alterada.

## Parte 1 — Ponta a ponta partindo do Seialz
1. Você envia, pelo Seialz (conversa com 11964298621, "Responder por" = Evolution 7020), o texto `SEIALZ-E2E <hora>`. Usar o fluxo normal garante que o teste passe pelo mesmo caminho de produção (prefiro que você envie em vez de eu simular sua sessão).
2. Eu consulto `messages`: `id`, `whatsapp_message_sid`, `endpoint_id`, `content`, `metadata.evolution` (key.id / remoteJid salvos).
3. Confirmo que `whatsapp_message_sid` == `metadata.evolution` key.id.
4. Chamada controlada: `POST /chat/updateMessage/evo-40ae935c-628b2eab` com `key.id = whatsapp_message_sid`, `fromMe:true`, `remoteJid` = o salvo (ou `5511964298621@s.whatsapp.net`), texto `SEIALZ-E2E EDITADA`. Registro request/response (credenciais redigidas).
5. Você confirma no celular o texto editado e o rótulo "Editada".
6. Eu leio de novo a linha em `messages` e os eventos recebidos: o esperado é que `content` continue com o texto antigo. Isso mostra a lacuna que a feature precisa fechar.

## Parte 2 — Janela real de edição
- Enviar 6 mensagens independentes de uma vez, direto pela Vultr (`SEIALZ-JANELA-N`), anotando hora e key.id de cada uma.
- Cada mensagem recebe **uma** tentativa de edição, na idade marcada para ela:

| Msg | Idade alvo |
|---|---|
| J1 | ~10 min |
| J2 | ~14 min |
| J3 | ~16 min |
| J4 | ~20 min |
| J5 | ~30 min |
| J6 | ~60 min |

- Se J2 funcionar e J3 falhar, o limite fica entre 14 e 16 min.
- Para cada mensagem, registro idade exata | HTTP status | response da Evolution. A coluna "celular mudou?" você confirma no fim.
- Observação: a Evolution pode responder 2xx mesmo quando o WhatsApp recusa a edição. Por isso, a confirmação no celular vale mais que a resposta.
- O teste leva cerca de 60 min e é feito em esperas de até 10 min.

## Entrega
1. Tabela da Parte 1 (IDs, igualdade de `whatsapp_message_sid`, conteúdo antes/depois no Seialz, celular).
2. Tabela da Parte 2 (idade | HTTP | response | celular).
3. Depois disso, monto o plano definitivo da feature em um novo plano, para sua aprovação. Ele deve cobrir:
   - edge function `evolution-edit-message`, com autenticação, organização, autoria, janela e somente texto/Evolution;
   - colunas de edição em `messages` (ex.: `edited_at`, `original_content`/histórico);
   - comportamento dos triggers;
   - UI Web/Mobile com o selo "Editada";
   - o que acontece com edições feitas no próprio celular.

## Riscos
- Sete mensagens reais vão para 11964298621.
- Mensagens enviadas direto pela Vultr (Parte 2) não aparecem no Seialz. Isso é esperado.
