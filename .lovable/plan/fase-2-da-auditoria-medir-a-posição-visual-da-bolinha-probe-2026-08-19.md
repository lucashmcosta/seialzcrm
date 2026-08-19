# Fase 2 da auditoria: medir a posição VISUAL da bolinha (probe apenas)

Os 3 captures reais mostram o mesmo padrão e nenhuma divergência interna: `RAF_TICKS=312`, `currentTime` avança (~0,49 → 4,49), o state React avança (`0:00 → 0:02 → 0:04`) e `COMPUTED_PROGRESS` avança (ex.: 0,033 → 0,167 → 0,301). Ou seja: engine, rAF e state estão saudáveis nesses três casos. Único detalhe consistente: `DURATION=NaN` no instante do `play` (t=0), o que explica `COMPUTED_PROGRESS=0(duration invalid)` só na primeira amostra — corrigido já em t=1s pelo `durationchange`.

Como o sintoma visual persiste, a próxima medição precisa sair do estado interno e ir para o DOM/CSS renderizado. Nada do player é alterado nesta fase.

## O que muda no coletor

Somente `src/lib/dev/audioProbe.ts` (dev-only, ativado por `?audioProbe=1`). O probe continua passivo: nenhuma leitura ou escrita em `play/pause/seek/src/preload`, nenhum listener de mídia adicionado ao player, nenhuma mutação de estilo.

Em cada amostra (0s / 1s / 3s / 5s) ele passa a capturar, a partir do container do player (irmãos do `<audio>`):

- `progress` do componente, reconstruído por leitura do DOM (posição relativa da bolinha) e comparado ao `currentTime/duration` do elemento;
- `style` inline da bolinha (`left` e `transform`, exatamente como escritos pelo React);
- `getBoundingClientRect().x` da bolinha (e `x` da trilha, para diferença absoluta);
- largura da waveform (`getBoundingClientRect().width` da trilha clicável);
- contagem de barras "percorridas" — barras com `opacity` alto (0,85) vs. inativas (0,3), lidas via `getComputedStyle`;
- identidade do nó da bolinha: guarda a referência do elemento na primeira amostra e compara por `===` nas seguintes, detectando recriação/remount.

Detecção dos elementos, sem depender de classes: a bolinha é o único filho com `position: absolute` dentro da trilha; a trilha é o ancestral com vários filhos de largura flexível; as barras são os filhos restantes. Se a heurística falhar, o campo é impresso como `n/a` em vez de adivinhar.

## Campos adicionados ao bloco impresso

```text
PROGRESS_STATE=          (progress por amostra, derivado do componente)
BULLET_STYLE=            (left/transform inline por amostra)
BULLET_X_START=
BULLET_X_1S=
BULLET_X_3S=
BULLET_X_5S=
BULLET_X_REL=            (x da bolinha - x da trilha, por amostra)
WAVEFORM_WIDTH=
BARS_ACTIVE=             (barras percorridas / total, por amostra)
BULLET_DOM_REPLACED=YES/NO
```

## Como interpretar

- `COMPUTED_PROGRESS` avança e `BULLET_X` avança → o problema não está no render; o sintoma é outro (ex.: transição CSS, ou um caso ainda não capturado).
- `COMPUTED_PROGRESS` avança e `BULLET_X` NÃO avança → causa na camada render/CSS. `BULLET_STYLE` distingue "React não escreveu o novo `left`" de "escreveu mas o layout não moveu" (ex.: trilha com largura 0, `transform` sobrepondo, ou ancestral com `display: table` como o já visto no ScrollArea).
- `BULLET_DOM_REPLACED=YES` → a bolinha está sendo recriada por re-render/virtualização, e a transição `left 0.05s` reinicia a cada troca, dando a aparência de bolinha parada.

## Coleta

Você abre `/commercial?audioProbe=1`, dá play em um áudio em que a bolinha acompanha e em outro em que ela trava (~5s cada) e cola os dois blocos. Vale também colar um caso travado mesmo que os números internos pareçam bons — é exatamente esse contraste que fecha o diagnóstico.

## Escopo técnico

- Alterado: `src/lib/dev/audioProbe.ts` (probe dev, removido ao fim da auditoria).
- Intocados: `src/components/whatsapp/AudioMessagePlayer.tsx`, `src/main.tsx` (loader condicional já existe), backend, banco, edge functions, storage e proxy.
- Nenhum fix no player nesta fase; o fix mínimo e visual será proposto em mensagem separada, após a leitura dos dados.
