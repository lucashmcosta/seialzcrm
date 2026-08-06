# Página de Suporte + link no rodapé

Adicionar uma página pública de Suporte (PT e EN) com o e-mail `suporte@seialz.com`, e um link "Suporte" no rodapé do site institucional, seguindo exatamente o padrão já usado nas páginas legais.

## URLs

- PT: `/suporte`
- EN: `/en/support`

Ambas entram na troca de idioma (o seletor PT|EN leva para a versão equivalente).

## Conteúdo da página

Reaproveita o layout legal já existente (mesma tipografia e largura das páginas de Privacidade/Termos):

- Título: "Suporte" / "Support"
- Parágrafo curto: canal oficial de atendimento da Seialz.
- E-mail de contato em destaque, clicável: `suporte@seialz.com`
- Prazo de resposta: até 24h em dias úteis (mesmo texto já usado no formulário do site).
- Orientação de o que incluir no e-mail (nome, empresa, descrição do problema) para acelerar o atendimento.

## Rodapé

Adiciona "Suporte" / "Support" na lista de links do rodapé, antes de "Contato", com o mesmo estilo e hover verde dos demais.

## Detalhes técnicos

- `src/i18n/config.ts`: novo tipo de página no mapa de rotas (`support`) com `/suporte` (pt-BR) e `/en/support` (en), incluído no `findLegalMatch` para que `swapLocaleInPath` funcione.
- `src/locales/{pt-BR,en}/support.json`: `seo.title`, `seo.description`, título e labels.
- `src/locales/{pt-BR,en}/support.md`: corpo da página em markdown (`?raw`), registrado em `src/i18n/dictionaries.ts`.
- `src/pages/legal/Support.tsx`: reusa `LegalMarkdownPage`.
- `src/App.tsx`: rota canônica `/suporte` e rota `/:locale/support` sob `LocaleGuard`, no mesmo bloco das legais.
- `src/locales/*/common.json`: chave `footer.support`; `LandingFooter.tsx` renderiza o link.
- `scripts/build-legal-pages.mjs`: incluir as duas páginas na geração de HTML estático, para que a URL funcione mesmo sem JS.

Nenhuma alteração em CRM, banco, edge functions ou regras de negócio.
