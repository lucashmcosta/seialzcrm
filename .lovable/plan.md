Criar `docs/MOBILE_LANDING_SECTIONS.md` com o código-fonte completo das seções da landing page após o Hero, para referência na implementação mobile.

## Conteúdo do documento

1. **Tokens compartilhados** — objeto `C` (paper, snow, ink, green, forest, soft, ash, line), variants `fadeUp` e `stagger`, fonte `Sora`. Descritos uma vez no topo.

2. **Assets referenciados** — nomes dos arquivos (sem binário):
   - `src/assets/brand/linhas-media-light.svg.asset.json`
   - `src/assets/brand/linhas-sutil-light.svg.asset.json`

3. **Seções (JSX completo, na ordem):**
   - `#problema` — "Quando marketing e vendas operam separados, a receita perde clareza."
   - `#solucao` — "Uma operação comercial sobre o mesmo dado." (com background `linhasSutil`)
   - `#loop` — "Um ciclo que evolui a cada venda." + lista completa dos 3 steps (Origem, Conversão, Aprendizado — extraídos de `src/locales/pt-BR/home.json`)
   - `#cta` — "Vamos conversar sobre sua operação." + formulário (Nome, E-mail, Empresa) e estado `submitted`
   - `LandingFooter` — código completo do componente + `LanguageSwitcher` referenciado

4. **Textos exatos em pt-BR** — copiados de `src/locales/pt-BR/home.json` e `src/locales/pt-BR/common.json` (blocos `problem`, `solution`, `loop`, `cta`, `footer`), substituindo as chaves `t("...")` para o mobile já ter as strings prontas.

5. **Descrição de animações em 1 frase por seção** — todas usam `fade + slide up (y:30→0, 0.6s ease-out) ao entrar no viewport, com stagger de 0.1s entre filhos`.

6. **Componente repetido** — o item da lista do Loop (linha com `borderTop`, título em coluna fixa `w-32` + descrição) documentado uma vez.

Arquivo único, sem lógica de negócio, apenas conteúdo visual/textual para replicar no app mobile.
