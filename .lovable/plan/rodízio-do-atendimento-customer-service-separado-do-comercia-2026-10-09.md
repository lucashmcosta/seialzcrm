# Rodízio do Atendimento (customer_service) — separado do Comercial

## Objetivo
Criar uma distribuição automática própria para conversas de Atendimento, sem tocar no rodízio do Comercial. Até um Admin ligar o rodízio numa organização, a única mudança visível é a proteção: conversa de Atendimento nova ou reaberta nunca vai para quem não tem acesso ao Atendimento.

## O que NÃO muda (Comercial)
`assign_round_robin` (1 e 2 argumentos), `contacts_round_robin`, `opportunities_round_robin`, o caminho comercial de `trg_threads_round_robin`, Meta Lead Ads, `vendor_personal`, colunas de rodízio em `user_organizations` e a aba atual da tela. Nenhuma conversa de Atendimento chama o rodízio comercial.

## Itens (uma migração por item, rollback salvo antes, verificação depois, log na seção "Rodízio do Atendimento" de etapa1-log.md)

1. **Estrutura**
   - `organizations.cs_round_robin_enabled boolean NOT NULL DEFAULT false`.
   - Tabela `cs_round_robin_members` (organization_id, user_id, active default false, last_assigned_at; PK composta; FK para organizations e users). Grants + RLS: leitura por membros ativos da org; escrita por `is_org_system_admin` ou `administracao.distribuicao` / `administracao.config_atendimento`.
   - `perms_v2_for_user(_org,_user)` STABLE SECURITY DEFINER (mesma lógica de `my_perms_v2`, para outro usuário; perfil de sistema = tudo).
   - `can_receive_cs(_org,_user)`: vínculo ativo + `atendimentos.ver` e `atendimentos.editar` (responder) ≠ "nenhum"; com o rodízio ligado exige também ativo em `cs_round_robin_members`.

2. **Escolha** — `assign_cs_round_robin(_org)` SECURITY DEFINER: nulo se desligado ou ninguém elegível; menor nº de conversas de Atendimento abertas atribuídas → `last_assigned_at` mais antigo (nulos primeiro) → id; `FOR UPDATE SKIP LOCKED`; atualiza só `cs_round_robin_members.last_assigned_at`.

3. **Regras (só business_context = customer_service)**
   - Contexto: a regra nova deriva o contexto do endpoint na inserção (mesma função de autofill) e também reavalia quando a conversa passa a customer_service; o ramo comercial do trigger continua idêntico.
   - Conversa nova do cliente: ligado → `assign_cs_round_robin`; desligado → dono do contato só se passar em `can_receive_cs`, senão sem responsável.
   - Iniciada por usuário no Atendimento → quem iniciou.
   - Reabertura (`trg_messages_smart_reopen`, ramo customer_service): candidato = último responsável no histórico de atribuição; se elegível volta para ele; senão ligado → `assign_cs_round_robin`; desligado/nulo → sem responsável. Ramo comercial inalterado.
   - Assumir/Reatribuir/Atribuir: como hoje. Dono do contato nunca muda.
   - Motivo em `last_routing_decision` e no histórico ("Rodízio do Atendimento", "Voltou para quem atendia", "Sem responsável: ninguém disponível").
   - Segurança de ingestão: toda lógica nova dentro de bloco com EXCEPTION → conversa gravada sem responsável e erro registrado (tabela de falhas existente ou nova tabela `cs_routing_errors`, só service_role).

4. **Acerto ao ligar** — RPC `cs_round_robin_preview(_org)` (contagem de conversas abertas de Atendimento com pessoas fora da lista) e `cs_round_robin_enable(_org)` (liga e redistribui: último responsável ativo na lista → `assign_cs_round_robin` → sem responsável; motivos no histórico; sem notificação nem mensagem; retorna contagens). Não é executada nesta implementação.

5. **Tela /settings/round-robin** — abas "Comercial" (tela atual intacta) e "Atendimento": interruptor geral com o texto pedido e confirmação do item 4; lista de elegíveis com interruptor individual ("Desative para pausar, ex.: férias") e Abertas agora / Recebidas hoje / 7 dias / Último (do histórico do Atendimento); em cinza quem não pode participar e o motivo. Visível para Admin, `distribuicao` ou `config_atendimento`. Card de Configurações: "Distribuição automática do Comercial e do Atendimento".

6. **Verificação** (transação desfeita, sem envios) — todos os casos do documento para Atendimento (incluindo erro forçado e acerto simulado) e Comercial (lead WhatsApp, lead Meta, oportunidade, reabertura comercial) comparados com a regra atual no mesmo estado. Ao final, rodízio do Atendimento desligado em todas as organizações.

## Efeito imediato a confirmar
Com o rodízio desligado, a proteção já vale. Na Central, o perfil Consultor está com Atendimentos Ver = "nenhum": quando clientes desses consultores voltarem a falar, a conversa reabre **sem responsável** (hoje volta para o consultor). Isso segue a regra do documento; registro no log a quantidade afetada antes de aplicar.

## Detalhes técnicos
- Docs atualizadas no mesmo PR: `docs/modules/inbox/`, `docs/reference/database/` (ADR-0007) e ADR novo para os triggers alterados (exigência do ADR-0007 item 5).
- Rollbacks em `docs/platform/security/rbac-v2/rollback/cs-rr-<item>.sql` com as definições atuais de `trg_threads_round_robin` e `trg_messages_smart_reopen` capturadas antes.
- Sem overload de RPCs existentes; funções novas com `search_path=public`.
