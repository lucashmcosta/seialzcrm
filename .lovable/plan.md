# Prévia do A3 — ajustar a folha à largura, sem mexer no documento

Muda somente a área da prévia em "Revisar e enviar" (`SignatureV2Sheet.tsx`, linhas 455–461). O restante do modal, o renderer, o snapshot, o template, o PDF final, a SuvSign e a V1 ficam intactos.

## Auditoria (estado atual, lido no código)
1. **Componente:** `SignatureV2Sheet.tsx`. O `previewHtml` (linha 177) monta a prévia a partir de `snapshot.documents[docTab].frozen_content.pages[].blocks`.
2. **Mecanismo:** HTML direto no DOM (`dangerouslySetInnerHTML` sanitizado com DOMPurify). Não é iframe, PDF nem imagem. Só entram blocos `text`/`heading`.
3. **Tamanho lógico:** nenhum. A folha usa `max-w-[500px]`, padding de 48px e `min-h-[600px]`. Ela ignora os 816x1056 do layout `legacy_template_816x1056`.
4. **Scroll:** fica no `div` `flex-1 overflow-y-auto` da coluna direita. Nada volta esse scroll para o topo ao entrar no A3 ou ao trocar de documento.
5. **Escala:** não existe `transform: scale`, `zoom` nem cálculo responsivo.
6. **Por que aparece cortada ou ampliada:** o conteúdo do template foi feito para 816px de largura (larguras e estilos inline) e está sendo espremido numa caixa de 500px com `prose` e `break-words`. O texto quebra e transborda, a folha perde a proporção e não há reenquadramento. Também não há reset de scroll, então a prévia pode abrir fora do início da página.

## Correção (só apresentação)
- Cada página é renderizada no **tamanho lógico original**. Uso a largura e a altura da página ou do `coordinate_system` do snapshot quando vierem. Se não vierem, uso 816x1056.
- Um medidor lê a largura disponível da coluna e calcula `escala = min(1, (largura − margens) / largura lógica)`. A folha é reduzida com `transform: scale`, com origem no canto superior. Um invólucro ocupa o tamanho já reduzido, para o scroll ficar correto e sem espaço sobrando. A folha nunca é ampliada acima de 100% e nunca é deformada.
- As classes `prose`, `break-words`, `max-w-[500px]` e `min-h-[600px]` saem da folha. Ela fica branca, com sombra, centralizada e com páginas empilhadas, sobre o fundo neutro atual.
- O scroll continua só nessa coluna, sem scroll horizontal. Ele volta ao topo ao entrar no A3 e ao trocar de documento. O cabeçalho e o rodapé ("Voltar" / "Enviar N documentos") continuam fixos.
- No mobile é a mesma lógica: o seletor fica acima e a folha se ajusta à largura.

## Validação
- Abro o A3 com o `frozen_content` real da solicitação QA-LEGACY Procuração já existente, sem fazer novo envio. Se o preview de teste não permitir login, uso uma cópia desse snapshot lida do banco e renderizada no mesmo componente.
- Prints no desktop: topo da folha, margens, página centralizada e inteira na largura, rodapé visível. Depois rolo até o fim e volto ao topo. Tiro também um print no mobile.
- Informo a escala e as larguras medidas.
- Regressão: A1, A2, A4, lista/detalhe, envio, Copiar link, download e V1 não são tocados, porque a alteração fica limitada ao bloco da prévia.

Resultado esperado: `PREVIEW A3 AJUSTADO À LARGURA, PROPORÇÃO PRESERVADA E PDF/RENDERER INALTERADOS`
