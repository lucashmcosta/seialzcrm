# Garantir que qualquer conta nova consiga conectar e vincular um número

## O que ainda pode falhar

Corrigi hoje o caso da MSM, mas a auditoria mostra que **ainda existe uma porta aberta**: as rotas de WhatsApp passaram a ser criadas apenas no caminho "Nova conta" do Portal Admin. Quem cria conta pelo **cadastro próprio da tela de entrada** (ou por qualquer outro caminho que crie a organização direto no banco) continua nascendo sem rotas — e vai bater exatamente no mesmo erro ao vincular o número.

O que conferi e está OK:
- A liberação do Evolution está ativa de forma global, então não trava conta nova.
- Etapas do funil, perfis de permissão, assinatura e configurações de inteligência já são criadas nos dois caminhos.
- As regras de entrada de mensagem têm um padrão próprio quando a conta não tem nada configurado, então não dependem de cadastro prévio.
- O menu Comercial já aparece para número Evolution (ajuste de hoje).

## O que vou fazer

1. **Fechar a porta na origem, no banco**: criar as duas rotas (Comercial e Atendimento) automaticamente sempre que uma organização é criada, independente de por onde ela foi criada — Portal Admin, cadastro próprio ou inserção direta. É o mesmo mecanismo que já cria as configurações de inteligência hoje.
2. **Evitar duplicidade**: com isso no banco, tiro a criação manual que coloquei na função "Nova conta" e adiciono uma proteção para nunca existirem duas rotas do mesmo tipo na mesma conta.
3. **Provar que funciona**: criar uma conta de teste pelos dois caminhos, conferir que as rotas nascem sozinhas, e apagar a conta de teste em seguida. Também confirmo que todas as contas atuais estão com as duas rotas.
4. **Registrar a regra** na documentação e na memória do projeto, para não voltar a acontecer em mudanças futuras.

## Detalhes técnicos

- **Migration**:
  - `fn_seed_default_messaging_lines()` — trigger `AFTER INSERT ON public.organizations`, `SECURITY DEFINER`, `search_path = public`. Insere as duas linhas (`commercial`/`sales`/`commercial` e `customer_service`/`customer_service`/`customer_service`, `channel='whatsapp'`, `is_active=true`, `active_endpoint_id` nulo) com `ON CONFLICT DO NOTHING`. Envolvida em `EXCEPTION WHEN OTHERS THEN RETURN NEW` para nunca derrubar a criação de conta nem o gatilho de cadastro (`handle_new_user`, que é `SECURITY DEFINER` e roda dentro do signup).
  - Índice único parcial `uniq_messaging_lines_org_channel_inbox` em `(organization_id, channel, inbox_key)` — hoje não existe nenhuma restrição, e é o que dá o `ON CONFLICT` e impede duplicidade. Verificação bloqueante antes de criar: conferir que não há duplicados atuais; se houver, reporto em vez de criar o índice.
  - Sem `DROP`, sem alteração de RLS, sem tocar em `handle_new_user`.
- **Edge function** `admin-create-organization`: remover o bloco de `insert` em `messaging_lines` que adicionei hoje (a trigger passa a ser a única fonte), mantendo a limpeza de `messaging_lines` no rollback. Redeploy.
- **Validação**:
  - `INSERT` de uma organização de teste → conferir 2 linhas → `DELETE` da organização de teste (cascade remove as linhas).
  - Contagem final por organização: todas com exatamente 2 rotas `whatsapp` (Squadra e Viagi têm rotas extras legítimas de outro canal/histórico — não mexo nelas).
- **Documentação**: `docs/modules/messages/data-model.md` e `docs/integrations/evolution-api/` — registrar que `messaging_lines` é pré-requisito do vínculo de número e é semeada por trigger. Memória nova com a regra.
- Nada muda em roteamento, envio, gates canônicos, fila de atribuição ou números já vinculados.
