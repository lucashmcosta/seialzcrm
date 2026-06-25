## Problema

Áudios recém-enviados às vezes mostram "Não foi possível carregar este áudio" (e o mesmo para mensagens com mídia). O arquivo `.ogg` realmente existe no Storage do Supabase, mas no instante em que o `<audio>` do navegador tentou carregar pela primeira vez, o upload ainda não tinha terminado (a mensagem é inserida no banco logo após o INSERT pelo Railway/edge, antes do arquivo aparecer publicamente). O browser dispara `error`, o `AudioMessagePlayer` marca `hasError=true` e **nunca tenta de novo**, mesmo depois que o arquivo já está disponível — só F5 resolve.

Confirmei o diagnóstico testando os arquivos da conversa Adriano/Tamires: todos respondem HTTP 200 `audio/ogg` agora, mas a UI ficou travada no estado de erro do primeiro carregamento.

## Solução

Tornar o `AudioMessagePlayer` resiliente a falhas transitórias de carregamento, com retry automático e fallback manual. Sem mudar backend nem schema.

### Mudanças

**1. `src/components/whatsapp/AudioMessagePlayer.tsx`** — adicionar retry com backoff:
- Novo estado `retryCount` (0..N) e `isRetrying`.
- No handler `onError` do `<audio>`: se `retryCount < 3`, agendar um retry com backoff (2s → 5s → 10s) que faz `audio.load()` (forçando re-fetch da URL). Só marca `hasError=true` após esgotar as tentativas.
- Quando `hasError=true` (já tentou tudo), mostrar a UI atual ("Não foi possível carregar este áudio" + "Baixar áudio") **mais** um botão **"Tentar novamente"** que reseta `retryCount`/`hasError` e chama `audio.load()`.
- Pequeno spinner/texto "Carregando áudio..." enquanto está em estado `isRetrying`, no lugar do botão de play, pra dar feedback visual.
- Manter `reportAudioFailure` apenas após esgotar os retries (não reportar a cada tentativa) pra não poluir Sentry.

**2. Mesmo padrão para `<video>` e `<img>` em `src/components/contacts/ContactMessages.tsx`** (e equivalentes na inbox se aplicável):
- Wrapper leve que detecta `onError` e tenta recarregar com backoff (2s/5s/10s) antes de mostrar fallback definitivo de erro com botão "Tentar novamente".
- Para vídeo: simples — adicionar key dinâmica + `onError` que faz `videoRef.load()`.
- Para imagem: trocar `src` com cache-buster (`?r=N`) no retry.

### Onde NÃO mexer

- Backend / Railway / edge functions: não alterar a ordem INSERT vs upload. A solução de frontend já cobre 100% dos casos observados e é menos arriscada.
- Layout, design system, cores: sem mudanças visuais além do botão "Tentar novamente" e do estado de loading.

## Resultado esperado

- Áudio recém-enviado que falhar no primeiro `loadedmetadata` vai tentar de novo após 2s/5s/10s automaticamente, sem o usuário fazer nada. Como o upload do `.ogg` da Twilio raramente passa de poucos segundos, na prática o player vai "se curar" sozinho.
- Se mesmo após 3 tentativas o arquivo realmente não existir (caso raro de upload que falhou de fato), aparece "Não foi possível carregar este áudio" com **"Tentar novamente"** + "Baixar áudio", e o usuário consegue se desbloquear sem precisar dar F5 na página.
