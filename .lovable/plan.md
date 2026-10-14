# Galeria moderna de Widgets (/widgets)

## Como vai ficar
- **Topo:** título "Widgets", uma linha de descrição e um contador discreto ("2 disponíveis · 1 aberto").
- **Grade responsiva:** `grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`, com 1 coluna no celular e 4–5 em telas grandes. Já comporta dezenas de widgets.
- **Cartão (o cartão inteiro é clicável):**
  - Em cima, uma **área de prévia** com cerca de 140px de altura, fundo `bg-muted` e um leve padrão de grade. Dentro dela, um desenho estático que representa o widget.
  - Embaixo, o **ícone em destaque** num quadrado com fundo verde suave (`--sz-green-dim`), o **nome**, a **descrição** em até 2 linhas e o **indicador de estado** à direita:
    - Fechado: nada, ou só um texto fraco "Abrir".
    - Aberto: ponto verde e o texto "Aberto".
    - Minimizado: ponto em tom neutro e o texto "No dock".
  - Ao passar o mouse, o cartão sobe 2px, a borda ganha o verde e a prévia se aproxima um pouco (escala de 1.02). Ao clicar, ele afunda um pouco (escala de 0.98).
  - Teclado: o cartão é um `button` com foco visível e `aria-label` do tipo "Abrir Jogo da Velha (minimizado)".
- **Entrada:** os cartões aparecem com fade e um leve deslocamento em sequência curta (40ms entre um e outro, até 300ms no total).
- **Movimento reduzido:** com `useReducedMotion()` (prefers-reduced-motion), não há deslocamento nem escala; só a troca de cor e opacidade.
- **Estado vazio e celular:** as mesmas mensagens de hoje, num visual mais limpo, com ícone grande e esmaecido.

## Prévias
- São leves e puramente visuais. Não montam o widget nem criam uma segunda instância.
  - Calculadora: um "visor" com o valor de exemplo `R$ 1.234,56` em Share Tech Mono e dois campos simulados.
  - Jogo da Velha: um mini tabuleiro 3×3 fixo, com alguns X e O e uma linha destacada.
- Ficam num campo opcional `Preview` da definição do widget, no registry. Widget sem prévia mostra o ícone grande centralizado. Assim, widgets futuros funcionam sem exigir prévia.

## Comportamento
- Clicar chama `ws.open(key)`, como hoje. Isso abre, restaura do dock ou traz para frente, sem duplicar.
- O estado vem de `ws.layout.windows[key].state`, só leitura.
- O Workspace V2, o banco, as permissões, os componentes da Calculadora e do Jogo da Velha, o Comercial e o Atendimento não mudam.
- Sem dependências novas: uso o framer-motion que já está instalado.

## Arquivos
- `src/pages/widgets/WidgetsCatalog.tsx`: refeito como galeria (cabeçalho, grade e lista animada).
- `src/pages/widgets/WidgetGalleryCard.tsx` (novo): cartão com prévia, estado e microinterações.
- `src/widgets/types.ts`: novo campo opcional `Preview?: ComponentType`.
- `src/widgets/overtime-calculator/OvertimePreview.tsx` (novo) e `src/widgets/tic-tac-toe/TicTacToePreview.tsx` (novo): só estáticos, sem nenhum import dos componentes funcionais.
- `src/widgets/registry.ts`: liga `Preview` aos dois widgets.
- `docs/modules/widgets/README.md`: uma linha sobre `Preview`.

## Validação
- Typecheck e os testes atuais.
- Sem sessão logada, este projeto não permite abrir a galeria real. Por isso, a conferência visual nos estados fechado, aberto e minimizado e com movimento reduzido fica para você fazer na prévia.
