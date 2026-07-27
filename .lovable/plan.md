## Objetivo

Eliminar o warning `Could not Fast Refresh ("useSiteI18n" export is incompatible)` separando os hooks e utilitários do componente `SiteI18nProvider`, para que o React Fast Refresh do Vite pare de invalidar o módulo e o erro fantasma `useSiteI18n must be used within SiteI18nProvider` deixe de aparecer.

## Alterações

### 1. Novo arquivo: `src/i18n/useSiteI18n.ts`

Conterá:
- O `SiteI18nContext` (movido de `SiteI18nProvider.tsx`)
- O tipo `SiteI18nContextValue`
- O hook `useSiteI18n`
- O hook `useSiteT`

Sem JSX, sem componentes — arquivo puramente de hooks, compatível com Fast Refresh.

### 2. `src/i18n/SiteI18nProvider.tsx` (refatorado)

- Passa a importar `SiteI18nContext` do novo arquivo
- Exporta **apenas** o componente `SiteI18nProvider`
- Remove o re-export de `detectLocale` (consumidores importam direto de `@/i18n/config`, que já é a fonte)

### 3. Atualizar imports nos 6 arquivos consumidores

| Arquivo | Import atual | Novo import |
|---|---|---|
| `src/App.tsx` | `{ SiteI18nProvider, detectLocale }` de `@/i18n/SiteI18nProvider` | `{ SiteI18nProvider }` de `@/i18n/SiteI18nProvider` + `{ detectLocale }` de `@/i18n/config` |
| `src/pages/legal/LegalMarkdownPage.tsx` | `{ useSiteT }` de `@/i18n/SiteI18nProvider` | `{ useSiteT }` de `@/i18n/useSiteI18n` |
| `src/pages/LandingPage.tsx` | idem | idem |
| `src/components/landing/LanguageSwitcher.tsx` | idem (provavelmente `useSiteI18n`/`useSiteT`) | de `@/i18n/useSiteI18n` |
| `src/components/landing/LandingNavbar.tsx` | idem | idem |
| `src/components/landing/LandingFooter.tsx` | idem | idem |

Confirmarei os símbolos exatos de cada arquivo antes de editar.

## Riscos

Zero de runtime — é reorganização de exports. O `SiteI18nContext` continua sendo a mesma instância singleton (agora criada no novo arquivo). Todos os consumidores passarão a ler do mesmo módulo.

## Validação

- `tsgo` para confirmar que todos os imports resolvem
- Flush HMR e checar console — o warning `Could not Fast Refresh` deve sumir para `SiteI18nProvider.tsx`
- Página `/pt-br` continua carregando normalmente