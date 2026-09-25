# Proposta A — corrigir master/detail do modal SuvSign V2

Só composição visual do `SignatureV2Sheet.tsx`. Backend, SuvSign, Copiar link, schema, snapshot, webhook, multidocumento, V1 e flags não mudam.

## Diagnóstico (a confirmar no passo 1)
- O código já tem a coluna de 300px e o painel à direita, mas eles dependem das classes responsivas `md:`. No print, essas classes não aparecem aplicadas: a lista e o botão ocupam 100% da largura, o painel direito fica escondido e o modal não tem a altura fixa de 90dvh.
- [INCERTO] A causa pode ser um bundle antigo no preview ou um conflito de classes com o `DialogContent` (base `grid` + `sizeClasses`). O primeiro passo é medir isso no navegador.

## O que muda
1. **Medir antes de mexer:** abrir a oportunidade no preview (login do piloto) e medir a largura da coluna e se o painel direito existe.
2. **Layout sem depender de breakpoint CSS:** o `useIsMobile()` do projeto decide o modo.
   - Desktop: grid fixo `grid-cols-[320px_1fr]`, sempre com as duas colunas visíveis.
   - Mobile: lista → detalhe com "Voltar".
   - O `DialogContent` passa a ser `flex`, com altura fixa de 90dvh, para anular a base `grid`.
3. **Coluna esquerda (320px):**
   - rótulo "SOLICITAÇÕES" e botão compacto "+ Novo envio" (`size="sm"`, sem largura total), como no HTML;
   - itens densos: documentos, participante · N documentos, status e data;
   - o item selecionado recebe fundo discreto e um indicador lateral de 2px.
4. **Painel direito:**
   - a primeira solicitação fica selecionada ao abrir;
   - clicar em outra troca só o painel direito;
   - hierarquia do HTML:
     - status grande + data relevante;
     - "Participantes" com ✓, nome, e-mail e assinou/abriu em;
     - "Documentos" com ✓ e "Baixar" pequeno;
     - Atualizar/Cancelar discretos.
5. **Rascunho:** a coluna esquerda continua visível. Só o painel direito mostra "Rascunho", os documentos, o participante e "Continuar preparação", que retoma no estado certo, como já implementado.

## Validação obrigatória (visual, não pelo código)
Playwright no preview, com 1280px de largura:
- abrir a oportunidade 9a865dec… e depois "Enviar contrato V2 (Piloto)";
- medir as duas colunas;
- clicar no rascunho, tirar o print e conferir o painel direito;
- clicar em uma concluída, tirar o print e confirmar que o painel mudou;
- também um print mobile.

Se o login não for possível, não declaro PASS visual.

Resultado esperado: `PROPOSTA A — MASTER/DETAIL CORRIGIDO E VALIDADO VISUALMENTE`
