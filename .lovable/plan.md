## Diagnóstico

O erro `NotFoundError: Failed to execute 'insertBefore' on 'Node'` **não é bug do CloseDatePromptDialog nem do Radix**. Os breadcrumbs do Sentry confirmam a causa real:

- `html.translated-ltr` no `<html>` → **Google Translate ativo** na aba do usuário.
- Cliques em `font > font` → Google Translate envolve nós de texto em `<font>` tags injetadas fora do controle do React.
- Erro logo em seguida no reconciliador do React (`Wj`/`ck`/`dk` = commit phase).

Quando o React tenta remover/inserir um nó de texto que o Translate já substituiu por `<font>...</font>`, a referência do fiber aponta para um nó que não é mais filho do pai atual → `insertBefore` falha e o ErrorBoundary sobe.

Isso é um problema conhecido do React 18 + Google Translate (issue facebook/react#11538). Acontece principalmente em Dialogs/Toasts porque montam/desmontam texto dinamicamente. O stack aparece "no CloseDatePromptDialog" só porque foi o Dialog aberto no momento — pode se manifestar em qualquer componente com texto condicional.

## O que fazer (mudança mínima e cirúrgica)

### 1. Desativar tradução automática no app inteiro

Em `index.html`, dentro de `<head>`:

```html
<meta name="google" content="notranslate" />
```

E em `<html lang="pt-BR" translate="no">` adicionar o atributo `translate="no"`.

Isso é o fix oficial recomendado pelo time do React para apps SPA. Não impede o usuário de traduzir manualmente via extensão, mas impede a tradução automática que causa 99% desses crashes.

### 2. Silenciar o ruído no Sentry quando o DOM foi mutado externamente

Em `src/instrument.ts`, adicionar ao `beforeSend` um matcher para:

- `name === 'NotFoundError'` **e** mensagem inclui `insertBefore` ou `removeChild`
- **e** o documento tem `document.documentElement.classList.contains('translated-ltr' | 'translated-rtl')` ou existe `<font>` injetado.

Nesses casos, retornar `null` (drop) — o crash já não é acionável pelo nosso código.

### 3. (Opcional, defensivo) `translate="no"` nos containers de Dialog

Se após (1) ainda houver ocorrências residuais (usuário forçando tradução manual em cima do CRM), adicionar `translate="no"` na raiz do `DialogContent` em `src/components/ui/dialog.tsx`. Baixo custo, alta cobertura.

## Escopo

Arquivos a editar (3):

- `index.html` — meta tag + atributo `translate="no"` no `<html>`.
- `src/instrument.ts` — filtro `beforeSend` para `NotFoundError`+`insertBefore/removeChild` quando Translate está ativo.
- `src/components/ui/dialog.tsx` — `translate="no"` no `DialogContent` (opcional, ativar só se necessário).

Nenhuma migração, nenhuma edge function, nenhuma mudança de layout ou lógica de negócio. Puramente presentation/observability.

## Riscos

- Nenhum funcional. `translate="no"` só afeta tradução automática; usuários que precisam ler em outro idioma podem trocar o idioma do próprio CRM (já suportado em `src/i18n/`).
- O filtro no Sentry é específico o suficiente para não engolir crashes reais de DOM.

## Validação pós-build

1. Confirmar via Sentry (24-48h) que ocorrências de `NotFoundError: Failed to execute 'insertBefore'` caem para ~0.
2. Não é reproduzível sem ativar Translate; teste manual no Chrome com "Traduzir esta página" ligado abrindo/fechando o `CloseDatePromptDialog` deve deixar de crashar (ou, no mínimo, o crash não sobe mais para o boundary).
