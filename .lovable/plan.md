# Renomear Mensagens → Comercial

## Escopo
- Trocar o rótulo do item do menu (Sidebar desktop e mobile) de "Mensagens" para "Comercial".
- Renomear a rota de `/messages` para `/commercial` (padrão inglês, consistente com `/contacts`, `/opportunities`, `/inbox`).
- Manter `/messages` como redirect permanente para não quebrar bookmarks, links em notificações antigas, docs internos e a UI de integrações Meta que menciona `/messages` como referência textual.
- Não renomeamos arquivos/pastas (`src/pages/messages/`, `src/components/messages/`, hooks `useMessageThreads`, tabelas `message_threads`, etc.) — o domínio de dados continua sendo "messages" no backend. Só o path público e o label mudam.

## Mudanças de código

1. **Rota** — `src/App.tsx`
   - Novo `<Route path="/commercial" element={<MessagesList />} />`.
   - Manter `<Route path="/messages" element={<Navigate to="/commercial?...preserva query..." replace />} />` usando um pequeno wrapper que preserva `search` (params `?thread=`, `?contact=`).

2. **Sidebar desktop** — `src/components/Layout.tsx` (linhas 82 e 156-160)
   - Trocar `t('nav.messages')` → `t('nav.commercial')` e `href: '/messages'` → `href: '/commercial'` nos dois blocos (Seialz sidebar e default layout).

3. **Sidebar mobile / drawer** — `src/components/mobile/MobileLayout.tsx` (linhas 61 e 77)
   - Mesmo ajuste de label e href.

4. **i18n** — `src/lib/i18n.ts`
   - Adicionar `nav.commercial`: `'Comercial'` (pt-BR) / `'Sales'` (en-US) — manter `nav.messages` existente por enquanto (usado só como fallback).

5. **Navegações internas** — atualizar para `/commercial`:
   - `src/components/Notifications.tsx:130` (`navigate('/messages')`).
   - `src/components/contacts/ContactDetail.tsx:331` (`navigate('/messages?contact=...')`).
   - `src/components/contacts/ContactConversations.tsx:53,151` (rotas para thread comercial).
   - Isso garante que novos links já usem a rota canônica; o redirect protege links antigos.

## O que NÃO muda (intencional)
- Textos de referência em telas de integração Meta (`AddMetaWhatsAppNumberDialog`, `AddMetaWabaDialog`, `MetaWhatsAppCloudDialog`, `MetaAdditionalEndpointsSection`) que exibem literalmente `/messages` como pista para admins — trocar para `/commercial` no mesmo PR seguindo o padrão, mas isso é só string cosmética.
- Comentários em código que citam `/messages` para descrever o módulo histórico — deixados como estão (o módulo interno continua sendo "messages"). Podem ser atualizados de forma incremental.
- Nomes de arquivos, pastas, hooks, tabelas, edge functions, `senderContext`, `business_context='sales'`, chaves de query cache — nada disso é rota, então fica.
- Rota `/inbox` (Atendimento) — não é afetada.

## Verificação
- Após aplicar: `rg -n "'/messages'|\"/messages\"" src/` deve mostrar apenas o Route de redirect em `App.tsx` e strings cosméticas (comentários / textos de UI de integração se optarmos por deixar).
- Abrir `/messages?thread=<id>` deve redirecionar para `/commercial?thread=<id>` sem perder o thread aberto.
- Sidebar exibe "Comercial" no lugar de "Mensagens" nas duas telas (desktop + mobile).

## Riscos
- Baixo. Todos os call sites de `/messages` estão inventariados acima; o redirect cobre qualquer link que eu não tenha encontrado (notificações persistidas, links em e-mails, bookmarks).
