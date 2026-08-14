# Refinamentos da Timeline Comercial (UX)

Somente apresentação. Arquivos tocados: `src/pages/messages/MessagesList.tsx`, `src/lib/messageGrouping.ts`, `src/components/messages/timeline/TimelineEventMarker.tsx` (variante clicável) e `tests/message-grouping.test.ts`. Nada de SQL, RPC, Edge Function, hook de dados, query, realtime, envio, endpoint/route, agrupamento ou regra de quebra de container.

## 1. Remover o separador "Número alterado"

Em `MessagesList.tsx` (linhas ~2322-2342) o bloco `rotationSeparator` (pílula "📞 Número alterado: 7067 → 7020") deixa de ser renderizado e a variável `lastEndpointId` usada só por ele sai junto.

A flag `endpointBreak` do descritor (linhas ~2266-2273) **continua igual**: ela é o que quebra o container. Apenas o marcador visual desaparece — o cabeçalho do container (`WhatsApp • (11) 5028-7020`) já dá essa informação.

## 2. Colapso por espaço visual (não por 5 mensagens)

Substituir `resolveBlockCollapse(count, isCurrent, expanded)` por uma versão baseada em altura estimada:

- `estimateItemHeight(kind)` em `src/lib/messageGrouping.ts`, com pesos consistentes por tipo de conteúdo já conhecido no render: texto curto (~1-2 linhas) ~44px, texto longo cresce por quebra de linha estimada, áudio ~56px, imagem/vídeo ~220px, documento/PDF ~80px, template ~120px, nota interna ~48px.
- `resolveBlockCollapseByHeight(heights, budgetPx, isCurrentBlock, expanded)`: percorre as mensagens **do fim para o começo** somando altura até estourar o orçamento; garante no mínimo 1 mensagem visível; devolve `{ visibleCount, hiddenCount, showToggle }` (mesmo contrato de hoje, para o render não mudar de forma).
- Orçamento = altura visível da área de conversa, medida por `ref` no viewport do `ScrollArea` (`clientHeight`), com fallback 480px quando ainda não medida. Sem `ResizeObserver` novo além da medição inicial + `window resize`.

Consequência: 15 mensagens curtas podem aparecer inteiras; 3 imagens grandes já atingem o limite; 2 áudios + 1 imagem também. `BLOCK_COLLAPSE_LIMIT` fixo em 5 sai de uso.

## 3. "Ver mais" como separador do container

O `<button>` atual (linhas ~2743-2762) vira um separador no mesmo estilo dos demais marcos da timeline: linha fina `bg-border/50` à esquerda e à direita, texto central pequeno em `text-muted-foreground` com chevron:

```text
────────────  ▼ Ver 17 mensagens anteriores  ────────────
────────────  ▲ Ver menos                    ────────────
```

- `TimelineEventMarker` ganha props opcionais `onClick` e `interactive`: quando presentes, o conteúdo central fica clicável com `hover:text-foreground`, `cursor-pointer` e rótulo acessível. Sem card, sem fundo, sem borda extra, sem estilo de botão.
- Ícones `CaretDown`/`CaretUp` (Phosphor, já usado no projeto).
- Rótulos: pt-BR `Ver {n} mensagens anteriores` / `Ver menos`; en `Show {n} earlier messages` / `Show less`.
- Continua dentro do container, acima das mensagens visíveis, e o estado segue em `expandedBlocks[segment.key]`.

## 4. Container atual sempre aberto

Inalterado: o último `block` da timeline (`currentBlockKey`) nunca colapsa.

## 5. Não muda

Agrupamento de bolhas, quebra de container por endpoint/provider/operador/dia/nota/evento, ordem cronológica, paginação, realtime, envio, seleção, responder, copiar, encaminhar, backend.

## Verificação

- `tsgo` limpo.
- `tests/message-grouping.test.ts`: casos para `resolveBlockCollapseByHeight` (muitas mensagens curtas caberem, poucas mensagens pesadas estourarem, mínimo de 1 visível, bloco atual nunca colapsa, expandido mostra tudo).
- Validação visual sua em `/commercial`: nenhuma pílula "Número alterado", preview histórico ocupando ~uma tela, separador "Ver N mensagens anteriores" discreto.
