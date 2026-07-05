# Mobile (React Native / Expo)

Documentação de referência para o app mobile do Seialz, que consome o **mesmo** Supabase do CRM web. O repo web é a fonte de verdade — se algo aqui divergir de `src/`, o repo web ganha.

| Arquivo | Conteúdo |
|---|---|
| [`app-context.md`](app-context.md) | Contexto arquitetural para o desenvolvimento do app (escopo v1, módulos, padrões) |
| [`backend-reference.md`](backend-reference.md) | Referência de backend: credenciais públicas, auth, RLS, tabelas e RPCs consumidas |
| [`dashboard-spec.md`](dashboard-spec.md) | Spec literal da tela **Início** (dashboard) para replicação no app |

> Estes documentos foram escritos como contexto para agentes de código (originalmente GitHub Copilot). Ao mudar schema, RLS, edge functions ou padrões do CRM web que afetem o escopo mobile, atualizar estes arquivos antes de novas implementações no app.
