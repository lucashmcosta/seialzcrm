# Auditoria do carregamento do probe de áudio (player intocado)

O player (`AudioMessagePlayer.tsx`) não será alterado. O objetivo é só provar se o probe carrega na sua sessão.

## O que já está confirmado no código

- O loader existe em `src/main.tsx` e é condicional a `new URLSearchParams(window.location.search).has("audioProbe")`.
- Não existe nenhum gate `import.meta.env.DEV` no probe nem no loader (o gate DEV do arquivo é outro bloco, de recuperação de chunks do Vite).
- O `.catch(() => {})` do `import()` engole silenciosamente qualquer falha de chunk — hoje uma falha de carregamento do módulo não deixa rastro.
- O probe só imprime `AUDIO_CAPTURE` no evento `play`; se ele nunca instalou, não há nenhuma linha — exatamente o seu sintoma.

Hipóteses prováveis, em ordem: (a) a query string não chega ao documento onde o app roda (preview em iframe / redirect de rota), (b) a sessão está com bundle antigo em cache (service worker antigo já foi kill-switch, mas cache do navegador conta), (c) falha de import silenciada.

## Correção mínima proposta (só instrumentação)

1. **Ativação resiliente à query string**: além de `?audioProbe=1`, aceitar `#audioProbe`, e persistir em `localStorage` (`audioProbe=1`) na primeira ativação, de modo que recarregar sem o parâmetro (ou dentro do iframe do preview) mantenha o probe armado. Também tentar ler a search do documento pai quando acessível.
2. **Prova de vida imediata**: logar `AUDIO_PROBE_LOADED` na primeira linha de `installAudioProbe()`, com a URL detectada e o modo de ativação.
3. **Erro de import visível**: trocar o `.catch(() => {})` por um log `AUDIO_PROBE_LOAD_FAILED` com o erro.
4. **Diagnóstico sob demanda**: em `window.__audioProbe`, além de `report()`/`json()`, adicionar `diag()` que imprime `AUDIO_ELEMENTS_FOUND`, quantos elementos já têm listener anexado, e o build tag.
5. Manter o probe 100% passivo: nenhum `play/pause/seek`, nenhum `src`/`preload`, nenhuma mudança no player.

## Como você valida (30 segundos)

1. Abra `/commercial?audioProbe=1` e recarregue com cache limpo (Cmd+Shift+R).
2. O console deve mostrar `AUDIO_PROBE_LOADED` imediatamente, antes de qualquer play.
3. No console, rode `window.__audioProbe` (deve ser objeto) e `document.querySelectorAll('audio').length`.
4. Rode `window.__audioProbe.diag()` e cole a saída.
5. Só então dê play em um áudio que travou e cole o bloco `AUDIO_CAPTURE`.

## Entrega do relatório

Depois do seu teste eu fecho os campos com valores reais:

```text
AUDIO_PROBE_QUERY_DETECTED=
AUDIO_PROBE_MODULE_LOADED=
WINDOW_AUDIO_PROBE_EXISTS=
AUDIO_ELEMENTS_FOUND=
ROOT_CAUSE_PROBE_NOT_LOGGING=
MINIMAL_FIX=
```

## Detalhes técnicos

- Arquivos tocados: `src/main.tsx` (loader) e `src/lib/dev/audioProbe.ts` (log de vida + `diag()` + ativação por localStorage/hash).
- Nenhuma mudança em `AudioMessagePlayer.tsx`, em hooks de mensagens, na lista de conversas ou no backend.
- Nada de novo endpoint, migração ou edge function.
