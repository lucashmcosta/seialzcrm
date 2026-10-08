# Regressão: conversa cai no Error Boundary após o painel fixado

## Situação atual (confirmada)
- O "Algo deu errado" vem do `Sentry.ErrorBoundary` em `src/main.tsx`: é uma exceção JS que derruba a árvore inteira, não um problema visual de layout.
- Ao selecionar uma conversa, `WidgetsTrigger` é montado no header (Comercial `MessagesList.tsx:2142`, Atendimento `InboxThreadDetail.tsx:269`) enquanto `PinnedWidgetPanel` já está montado. As duas instâncias chamam `useOrgWidgetConfig`, e cada uma abre um canal Realtime.
- A prévia não tem log de erro disponível neste momento, então a stack original ainda não foi capturada. A causa abaixo é a hipótese principal e só será confirmada no passo 1.

## Passo 1: capturar o erro real
- Abrir uma sessão autenticada da prévia pelo Playwright (`lovable auth-session`). Abrir /commercial e /inbox, selecionar uma conversa e gravar `pageerror` e console com a stack completa e o componente React envolvido.
- Se não for possível autenticar, buscar o evento correspondente no Sentry, que é para onde a tela de erro manda o relatório.
- Só depois disso declarar a causa raiz.

## Passo 2: hipóteses verificadas contra a stack
1. Realtime: o `supabase.channel()` atual é chamado dentro do efeito, com `.on()` depois do `subscribe` em uma instância reaproveitada. O realtime-js lança "cannot add postgres_changes callbacks after subscribe()" de forma síncrona, o que derruba a árvore.
2. Loop de publicação do contexto: `context={{...}}` é um objeto novo a cada render, e `setContext` roda em todo render. Isso aparece como "Maximum update depth".
3. Uso do contexto fora do Provider, ou Provider no nível errado. Exemplo: no Comercial o header fica fora de `PinnedWidgetProvider`.
4. Efeito de fechamento do `PinnedWidgetPanel`: tem `state` como dependência e chama `close()` antes de a configuração carregar.

## Passo 3: correção mínima (só no que a stack apontar)
- `useOrgWidgetConfig`: uma única assinatura Realtime por organização, com contador de assinantes no próprio módulo. O canal só é criado se ainda não existir e só é removido quando o último assinante sai. A query do React Query continua igual.
- `WidgetsTrigger`: memorizar o contexto por `organizationId`, `threadId` e `contactId`, e publicar no provider só quando um desses valores mudar.
- `PinnedWidgetPanel`: o efeito de fechamento depende de `openKey`, `isLoading`, `widgets` e `pins`, não do objeto `state`. Não fecha enquanto a configuração ou os pins estiverem carregando.
- Nenhuma mudança em banco/RLS, composer, mensagens, dispatcher, WhatsApp, roteamento ou no desenho dos Widgets.

## Passo 4: validação
- Typecheck/build.
- Playwright autenticado:
  - /inbox abre e selecionar uma conversa não gera `pageerror`;
  - /commercial abre e selecionar uma conversa não gera `pageerror`;
  - sem widget aberto, o layout fica igual ao anterior;
  - com o widget fixado aberto, o painel aparece ao lado da conversa, sem fundo escurecido, e o campo de mensagem continua clicável.
- O relatório traz a stack original, a causa raiz, os arquivos corrigidos e as capturas de tela.
