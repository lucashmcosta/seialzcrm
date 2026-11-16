# Corrigir "N+1 API Call" do Sentry (transcrições de áudio no /inbox)

## O que está acontecendo
Cada áudio na conversa busca a própria transcrição separadamente (1 chamada por áudio). Uma conversa com 20 áudios dispara 20 chamadas ao abrir, e mais até 4 repetições de cada uma a cada 10 s enquanto a transcrição não chega. É isso que o Sentry marca como N+1. Não é erro visível ao usuário, é desperdício de chamadas e lentidão.

## O que muda
- Os áudios que aparecem juntos na tela passam a pedir suas transcrições numa única chamada (agrupando os pedidos feitos no mesmo instante).
- A repetição a cada 10 s também passa a ser agrupada: uma chamada para todos os áudios ainda sem transcrição.
- Visual e comportamento ficam iguais: mesmo botão "Transcrição", mesmo texto, mesmo limite de tentativas.

## Fora do escopo
Nada de banco, permissões, Edge Functions, WhatsApp/Comercial ou outras telas.

## Detalhes técnicos
- Só `src/components/whatsapp/AudioTranscript.tsx` (+ helper novo `src/lib/audioTranscriptBatch.ts`).
- Helper estilo DataLoader: acumula `message_id`s numa fila e, no próximo tick (`setTimeout 0`), faz `select message_id, transcript, created_at ... in('message_id', ids) order created_at desc`, em lotes de até 100 ids; resolve cada promessa com a transcrição mais recente do seu id ou `null`. Erro rejeita todas as promessas do lote.
- `queryFn` do react-query passa a chamar `loadTranscript(messageId)`; `queryKey`, `staleTime` e `refetchInterval` inalterados.
- RLS de `audio_transcriptions` continua valendo (mesmo cliente anon/sessão).
- Teste Bun para o helper: 3 pedidos no mesmo tick geram 1 chamada; cada id recebe sua transcrição mais recente; id sem linha recebe null.
