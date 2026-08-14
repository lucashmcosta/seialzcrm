# Remover resíduos do separador "Número alterado" + validação do bundle servido

## Validação já executada (bundle servido pelo preview)

`GET http://localhost:8080/src/pages/messages/MessagesList.tsx` (625.532 bytes, módulo transformado atual):

- `"Número alterado"`: 2 ocorrências, **ambas em comentários** (linha 794 e 2692 do módulo servido). Nenhuma em JSX/render.
- `rotationSeparator` / `lastEndpointId`: **0 ocorrências** — o separador visual não existe mais no módulo servido.
- `PhoneCall01`: **0 ocorrências** no módulo servido (o import existe no source mas é eliminado pelo tree-shake do transform).
- Quebra de container por endpoint (`endpointBreak`) e cabeçalho de container (`WhatsApp • provider • número`, via `endpointNumbers` + `formatPhoneDisplay`): presentes.

Conclusão objetiva: **PREVIEW_SERVED_MARKER_PRESENT=NO** (marcador renderizável ausente). O que você viu no preview é bundle antigo no navegador (aba aberta antes da última aplicação de HMR) ou a URL publicada, que ainda não recebeu esse deploy.

## O que vou fazer (apenas limpeza, sem lógica)

1. Remover o import não usado `PhoneCall01` em `src/pages/messages/MessagesList.tsx`.
2. Remover/atualizar os dois comentários obsoletos que ainda citam "Número alterado" (linhas ~784 e ~2321 do source), para que nem em comentário o conceito reapareça.
3. Revalidar por HTTP o módulo servido: gate final `grep -c "Número alterado" == 0`, `rotationSeparator == 0`, `PhoneCall01 == 0`, e presença de `endpointBreak` + cabeçalho de container.
4. Rodar `tsgo` e `tests/message-grouping.test.ts` (quebra por endpoint continua existindo, sem marcador).
5. Só então pedir sua validação visual — com instrução de recarregar a aba com cache limpo (e publicar, se a validação foi na URL publicada).

## Detalhes técnicos

- Arquivo tocado: `src/pages/messages/MessagesList.tsx` (import + comentários). Nenhuma mudança de render, agrupamento, colapso ou regra.
- Nada em `src/lib/messageGrouping.ts`, backend, RLS, RPC ou edge functions.
