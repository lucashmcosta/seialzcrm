
# Ordenar nota de migração antes do template enviado

## Problema

A nota "Conversa migrada para o novo número WhatsApp 7020 (Meta Cloud)…" está aparecendo **depois** do template enviado na thread. Deveria aparecer **antes**, marcando o ponto da virada de canal.

## Causa

Em `supabase/functions/meta-whatsapp-send/index.ts`:

1. Linha ~364: insere a mensagem do template com `sent_at: new Date().toISOString()` (T0).
2. Linhas ~513-570: só após o POST à Meta retornar, insere a nota de migração — sem `sent_at`/`created_at` explícitos, então o Postgres carimba T0 + ~1-2s.

Resultado: a nota fica cronologicamente depois do template e o `chatItems` ordena assim na UI.

## Mudança (escopo mínimo)

Arquivo único: `supabase/functions/meta-whatsapp-send/index.ts`.

1. Antes do insert do template (linha ~364), capturar um único timestamp:
   ```ts
   const sendTimestamp = new Date();
   const templateSentAt = sendTimestamp.toISOString();
   const migrationNoteAt = new Date(sendTimestamp.getTime() - 1000).toISOString();
   ```
   Usar `templateSentAt` no insert do template (substitui o `new Date().toISOString()` inline).

2. No bloco de persistência da migração (linhas ~541-559), ao inserir a nota incluir:
   ```ts
   sent_at: migrationNoteAt,
   created_at: migrationNoteAt,
   ```
   Isso garante que a nota fique 1 segundo antes do template independentemente da latência do POST à Meta.

3. Manter o bloco de persistência **após** o sucesso do envio (não inserir nota se o envio falhou). Apenas o timestamp muda para retroceder a nota.

## Não muda

- Lógica de detecção, conteúdo da nota, metadata.kind, RLS.
- Frontend (`MessagesList.tsx` e `MobileMessagesList.tsx`) — o divisor system já é renderizado pelo predicado `metadata.kind === 'endpoint_migration_meta_7020'`.
- Dispatcher, edge functions de Twilio, `/inbox`.

## Critério de aceite

- Em qualquer thread Comercial migrada pela próxima vez, a nota aparece imediatamente **antes** do template enviado.
- Threads já migradas (Cheila, hellenasilva223) permanecem como estão — não vamos reordenar histórico retroativo. Se desejar corrigir as 2 threads existentes, faço um UPDATE manual depois (opcional).

## Pergunta

Quer que eu também rode um UPDATE corrigindo o `sent_at` das notas de migração já inseridas (Cheila, hellenasilva223) para 1 s antes do template enviado correspondente? Recomendo sim, são poucas rows.
