# Filtro por número do Comercial: incluir o 7020 e casar com o selo da conversa

## O que está errado hoje

Confirmado no banco e no código:

1. A lista do filtro vem da mesma consulta usada para envio, que só aceita números **ativos e com credencial Twilio/Meta**. O 7020 do Comercial existe em duas fichas — a antiga da Meta (inativa) e a atual do Evolution (ativa, sem credencial Twilio) — e as duas ficam de fora. Por isso o 7020 aparece no selo das conversas, mas não na lista para selecionar.
2. O selo da conversa mostra o número da **última mensagem**, enquanto o filtro compara o **número principal** da conversa. Quando os dois diferem, filtrar por 7067 pode esconder conversas que mostram 7067 (e vice-versa).
3. A conta tem várias fichas antigas de números Twilio marcadas como "outros"; nenhuma delas deve entrar na lista.

## O que fazer

- Montar a lista do filtro a partir das fichas de número **do Comercial** da conta (inclusive as inativas e as do Evolution), agrupadas por número: o 7020 aparece uma única vez e cobre as duas fichas. O 7027 (Atendimento) e os números "outros" continuam fora.
- Fazer o filtro comparar pelo **mesmo número que aparece no selo** da conversa, com o número principal como reserva — assim o que está escrito na lista é exatamente o que o filtro considera.
- Resultado: no filtro aparecem "Todos os números", o 7067 e o 7020; ao escolher 7020, ficam só as conversas com selo 7020.

## Detalhe técnico

- Novo hook `src/hooks/useSalesEndpointFilterOptions.ts`: consulta `communication_endpoints` da org (`channel='whatsapp'`, `purpose='commercial'`), sem exigir `is_active`/`sender_sid`/`status`; agrupa por dígitos de `external_address` retornando `{ key, address, label, endpointIds[], isOfficial }` (ordenado por número, oficial primeiro).
- `EndpointFilterDialog.tsx`: passa a receber essas opções (chave = número, não id de endpoint); mantém "Todos os números", "Limpar" e o selo "Principal" via `officialNumbers`.
- `MessagesList.tsx`: `endpointFilter` guarda a chave do número; casamento por `threadBadgeEndpoints[t.id].endpointId` (fallback `threadEndpointMap[t.id]`) pertencendo a `endpointIds` da opção; botão do funil aparece havendo ao menos uma opção; reset para `all` quando a chave sai da lista.
- Nada muda em envio, "Responder por", RPCs, RLS ou no módulo Atendimento; a ficha histórica Meta do 7020 não é alterada.
