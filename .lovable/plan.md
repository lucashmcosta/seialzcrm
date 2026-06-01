## Diagnóstico

A conversa "Junior Teste" foi auto-atribuída a outro usuário (Lucas Costa) por algum trigger de distribuição quando a thread foi criada. Por isso o composer mostra **"Atribuída a outro usuário · envio bloqueado"** — não há rota de reatribuição na UI: o botão "Assumir" só aparece quando `assigned_user_id IS NULL`.

## O que vou fazer

### A. Desbloqueio imediato (dado)
Reatribuir a thread "Junior Teste" para você (Mariane Carvalho) via migration, para você conseguir testar agora.

### B. Correção de UX (código — só InboxComposer + InboxThreadDetail, não toca em /messages)

1. **Botão "Assumir / Reatribuir para mim" sempre disponível** no header do composer
   - Se `assigned_user_id IS NULL` → botão "Assumir"
   - Se `assigned_user_id !== meu_id` → botão "Reatribuir para mim" (mesma ação, com `from_user_id` registrado no `last_routing_decision`)
   - Se já é minha → nada
   - Mantém o aviso "Atribuída a outro usuário" como contexto, mas **não bloqueia mais sem saída**.

2. **OwnerSelector no painel lateral** (`Dados da conversa` → "Atribuída a")
   - Substitui o texto `dadc0d30…` por um `<OwnerSelector>` que lista todos os usuários ativos da org e permite:
     - Reatribuir para qualquer usuário
     - Desatribuir (volta para fila)
   - Update vai direto em `message_threads.assigned_user_id` + `assigned_at` + `last_routing_decision` (action: `manual_reassign`).
   - Após mudança chama `refresh()` para atualizar composer.

3. **Composer continua bloqueando envio quando não é meu** (regra atual mantida — só responde quem é dono). A diferença é que agora dá pra virar o dono em 1 clique.

### Fora de escopo
- Não mexer em `WhatsAppChat.tsx` nem `/messages`.
- Não tocar nos triggers de auto-assign (eles continuam atuando em threads novas — isso é o comportamento esperado de fila).
- Não criar permissões novas: qualquer usuário da org pode reatribuir (igual ao OwnerSelector existente em Contatos/Oportunidades).

## Arquivos afetados
- `supabase/migrations/...` (1 update simples no thread de teste)
- `src/components/inbox/InboxComposer.tsx` (botão "Reatribuir para mim")
- `src/components/inbox/InboxThreadDetail.tsx` (OwnerSelector no painel lateral)

Aprova?
