# Preview da última mensagem na lista do /commercial

## Auditoria da versão atual (invariantes)

Tudo que controla rolagem e paginação está em `src/pages/messages/MessagesList.tsx`:

- `ScrollArea className="flex-1"` (linha ~1960) e fechamento (~2047)
- `ListBox` + `selectedKeys`/`onSelectionChange` (~1998-2011)
- bloco `{hasMore && (...)}` com o botão "Carregar mais" (~2030-2044)
- `hasMore`, `loadMore`, `loadingMore`, cursor e limite inicial 50 vivem em `src/hooks/useMessageThreads.ts` (`limit = 50`, cursor por `last_message_at`/`id`, append via `setThreads(prev => [...prev, ...mapped])`)
- filtros/busca/ordenação/realtime: `debouncedSearch`, `effectiveFilter`, `visibleThreadsWithSelected`, `enrichAndUpsert`

Nenhum desses pontos precisa mudar para o preview. Ponto de atenção honesto: `ChatListItem` está declarado **dentro** de `MessagesList.tsx` (linhas 244-329), acima do componente de página. Vou editar apenas esse trecho (mais uma linha de props no JSX do item e uma chamada de hook), sem tocar em ScrollArea, ListBox, wrapper, rodapé, `hasMore`/`loadMore` nem classes de layout.

## Fonte de dados

`ChatThread` hoje não expõe `last_message_id` (o RPC já retorna). Vou adicioná-lo ao tipo e ao `mapRpcToChatThread` — campo novo, sem alterar RPC, cursor, ordenação ou append.

Detalhes que faltam (`media_type`, `whatsapp_status`) vêm de **uma única query em lote** por `last_message_id`, no mesmo padrão já usado por `useThreadBadgeEndpoints` (que já resolve `last_message_id` em lote hoje).

## Implementação (5 peças confinadas)

1. `src/hooks/useMessageThreads.ts` — expor `last_message_id` no tipo/mapeamento (nada mais).
2. `src/hooks/messages/useThreadLastMessageMeta.ts` (novo) — hook em lote: recebe os `last_message_id` visíveis, faz um `select id, media_type, whatsapp_status, direction` em `messages` `.in('id', ids)` e devolve um mapa. Zero query por thread.
3. `src/lib/lastMessagePreview.ts` (novo) — helper puro: recebe `{ content, direction, mediaType, whatsappStatus }` e devolve `{ kind: 'text'|'audio'|'image'|'video'|'document'|'sticker', text, statusIcon }`. Fallback para marcadores legados `[Áudio]`, `[Imagem]`, `[Vídeo]`, `[Documento]`, `[Figurinha]` quando `media_type` é nulo.
4. `src/components/messages/LastMessagePreview.tsx` (novo) — apresentacional, uma linha, `truncate`, `text-xs text-muted-foreground`, ícones Phosphor (`Microphone`, `Image`, `VideoCamera`, `FileText`, `Sticker`) e status outbound (`Clock`, `Check`, `Checks`, `Checks` azul para read, `WarningCircle` destructive). Inbound nunca renderiza check; status nulo/desconhecido não renderiza ícone.
5. `ChatListItem` — renderiza `<LastMessagePreview />` logo abaixo do nome, antes da linha de meta (status · atenção · responsável). Recebe os dados por prop, calculada no `.map` existente do JSX.

## Diff esperado (gates)

- SCROLLAREA_CHANGED=NO
- LISTBOX_CHANGED=NO
- HASMORE_CHANGED=NO
- LOADMORE_CHANGED=NO
- PAGINATION_CURSOR_CHANGED=NO
- LIST_WRAPPER_CHANGED=NO
- SHOW_MORE_BUTTON_CHANGED=NO

## Validação antes do seu teste manual

typecheck limpo; preview de texto/áudio/imagem/documento; status outbound sent/delivered/read/failed; inbound sem check; truncamento; atualização via realtime já existente; confirmação por diff de que `limit = 50` e o bloco "Carregar mais" seguem byte-idênticos.

Entrego o diff resumido e paro — sem publicar.
