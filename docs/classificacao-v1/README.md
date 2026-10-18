# Pacote — Classificação de processos no Seialz (v1)

Central Trabalhista · motor 1.0.0 · 16/10/2026

> **No repositório do Seialz:** a pasta `motor/` deste pacote mora em `packages/motor-classificacao/` (copiada sem alterações; o CI roda os 475 testes e confere que `supabase/functions/_shared/classificacao/motor.mjs` é idêntico ao build). Os caminhos `motor/...` abaixo e na SPEC se referem a ela. A calibração exportada do protótipo em 16/10 está em `packages/motor-classificacao/dados/calibracao-exportada-2026-10-16.json`.

## Para quem recebe

Este pacote leva para o Seialz o motor de classificação validado pelo Lucas e pelo Renan. O vendedor vê a faixa do processo (Prata, Ouro, Titânio ou Diamante) e a comissão dele. O administrador calibra os números e publica versões.

Para começar, abra o Claude Code no repositório do Seialz, copie esta pasta para dentro dele (por exemplo em `docs/classificacao-v1/`) e cole o texto de `PROMPT.txt`.

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| `SPEC.md` | Especificação completa: widget do vendedor, correção pelo gestor, tela de calibração com versões, dados, permissões e critérios de aceite. |
| `motor/` | Motor em TypeScript puro, sem dependências. Faz exatamente o que o protótipo faz. |
| `motor/src/motor.ts` | Regras de cálculo das 13 teses. `calcularCaso(entrada, calibracao)`. |
| `motor/src/perguntas.ts` | Passos, perguntas, textos, condições e valor marcado de cada pergunta. `pendenciaDaTese()` para travar o "Próximo". |
| `motor/src/calibracao.ts` | Para a tela do admin: `mesclarCalibracao()` (importar), `conferirCalibracao()` (antes de publicar) e `compararCalibracoes()` (o que mudou). |
| `motor/src/tipos.ts` | `Entrada`, `Calibracao`, `ResultadoCaso`. |
| `motor/dados/` | `calibracao-v1.json` (semente) e `catalogo.json` (rótulo e explicação jurídica de cada número). |
| `motor/dist/motor.mjs` | O motor num arquivo só, para a edge function do Supabase. Gerado com `npm run build`. |
| `motor/tests/` | 475 testes: regras jurídicas, 400 casos-ouro conferidos contra o protótipo e calibração. |
| `motor/paridade/` | Scripts que rodam milhares de casos no protótipo e no motor e comparam. |
| `widget/icones/` | Os quatro materiais em SVG e as animações de referência da revelação. |
| `referencia/` | Os protótipos validados: `motor_comercial_v3.html` (calibração/admin) e `widget_vendedor.html` (vendedor). Servem só de referência de comportamento, não de visual. |

## Rodar os testes

Dentro de `motor/`, rode:

```
npm install
npm test            # 475 testes
npm run build       # gera dist/ e dist/motor.mjs
npm run paridade    # opcional: 6.000 casos contra os protótipos (precisa de Python + Playwright)
```

## Antes de publicar a primeira calibração real

Exporte a calibração final do protótipo: no `motor_comercial_v3.html`, no navegador onde ela foi ajustada, use o botão **Exportar calibração**. Depois importe esse arquivo na tela do admin do Seialz. Até isso ser feito, vale a semente `calibracao-v1.json`.
