# 0,0% ainda aparece cinza

O código do card já usa a cor de alerta (amarelo) para variação zero e o app compilou sem erro, então algo entre o código e o que aparece na sua tela não está batendo. Antes de mudar mais nada, é preciso ver a cor real que o navegador está aplicando naquele "— 0,0%".

## Passo 1 — Confirmar o que a tela está mostrando

Abrir a tela Início dentro do ambiente de teste, já logado, e ler a cor exata do texto "0,0%" do card Ganhas. Isso separa dois cenários:

- A cor aplicada continua cinza: a alteração não está chegando na tela (cache/estilo sobrescrito) e o conserto é ali.
- A cor aplicada já é o amarelo do tema, mas visualmente parece cinza/oliva: o problema é o tom escolhido no tema claro, não a lógica.

## Passo 2 — Correção conforme o resultado

- Se for cache/estilo: ajustar para que a cor da variação seja aplicada sem ser sobreposta e revalidar na tela.
- Se for o tom: usar o mesmo amarelo forte já usado no gráfico de rosca "Status" (o amarelo vibrante que você vê no total 846), em vez do amarelo mais apagado do tema claro, e deixar o traço e o número um pouco mais destacados.

Em qualquer cenário, a mudança fica só na aparência da variação zero, nos dois lugares: tela Início no computador e no celular.

## Passo 3 — Validação

Conferir na própria tela Início (período "Semana passada") que o "— 0,0%" do card Ganhas aparece amarelo, e que alta continua verde e queda continua vermelha.

## Detalhes técnicos

- Componentes envolvidos: `src/components/reports/KpiCard.tsx` (caso `isFlat` no `renderDelta`) e `src/components/mobile/MobileDashboard.tsx` (bloco equivalente). Ambos já estão com `text-warning`.
- Verificação via Playwright autenticado em `http://localhost:8080/dashboard`, lendo `getComputedStyle` do elemento da variação.
- Tokens: `--warning` existe em `:root` (45 93% 47%), `.dark` (45 93% 35%) e `.theme-seialz` (43 100% 50%). Se o tema ativo for o claro padrão, o tom 47% é mais oliva; nesse caso padronizar para o amarelo `#FFB800` do preset Seialz via token, sem cor fixa em componente.
- Nenhuma alteração em cálculo de KPI, períodos de comparação, RPCs ou dados.
