# Funil movido pela classificação do agente de IA

Data: 24/11/2026. Primeira org: Auxilius (Gabi). O desenho é genérico e configurado em cada agente.

## Problema (medido em produção em 24/11)

- 917 oportunidades desde 07/11. 589 abertas em "Nova conversa", 7 em "Em triagem", 1 em "Contrato enviado". As etapas "Aguardando equipe", "Extrato pedido" e "Extrato em conferência" estão vazias.
- Nada move a oportunidade. O agente classifica cada caso (SEGUE / EQUIPE ANALISA / NÃO SE ENCAIXA), mas a classificação só fica no texto do resumo do `transfer_to_human`.
- O `update_qualification` é a qualificação genérica de vendas (orçamento, decisor, prazo). Ele grava em `contact_memories`, que o funil não lê, e os valores vêm misturados (low/medium/high junto com cold/warm/hot).
- Das 307 perdas, 304 vieram de uma classificação em lote em 17/11. Desde então só 3 perdas foram marcadas à mão.
- O que há dentro de "Nova conversa":
  - cerca de 150 casos já com a equipe;
  - cerca de 80 que já ouviram "não se encaixa";
  - cerca de 260 em conferência, 137 delas paradas há mais de 3 dias.
- A CAPI da org manda LeadSubmitted quando a lead entra em "Aguardando equipe". Como ninguém entra nessa etapa, o evento não sai desde 18/11, e a Meta só recebe o Purchase.
- WhatsApp: a qualidade está RED. Em 50 conversas a lead recebeu follow-up depois da despedida de "não se encaixa", sem ter voltado a escrever. O agente não tem `end_conversation` ligado.
- Lead perdida que volta a escrever: em 5 de 6 casos ganhou uma oportunidade nova. A regra exata é conferida na Fase 0.

## Princípios

- **Reaproveitar o que existe:**
  - mudança de etapa por `transition_opportunity_stage_v1`, que segue a política da org;
  - perda por `fn_mark_opportunity_lost_internal_v1`, que usa o catálogo de motivos da org;
  - eventos para a Meta por `capi_event_rules`;
  - tela no mesmo padrão do `AgentContractCard`.
- **Nada fixo por org:**
  - as etapas e os motivos são escolhidos na tela do agente e guardados em `tool_settings`;
  - nenhuma migração leva id de etapa;
  - o `update_qualification` (que a Julia, da CT, também usa) fica como está.
- **O agente só avança:**
  - move apenas para uma etapa com `order_index` maior que a atual;
  - nunca mexe em oportunidade ganha ou perdida;
  - não age em conversa que já foi passada para a equipe ou atribuída a alguém.
- **Primeiro determinístico, depois o modelo.** O que dá para decidir por regra (respondeu, passou para a equipe, ficou em silêncio) não depende do modelo.
- **Ligado agente a agente, com modo sombra antes de valer.**
- **O simulador simula** e não grava nada, como no PR #307.

## Fase 0: decisões (sem código)

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Etapas | Nova conversa → Em conferência (renomear "Em triagem") → Equipe analisa (renomear "Aguardando equipe") → Qualificada (nova) → Contrato enviado → Ganho/Perdido |
| 2 | "Extrato pedido" e "Extrato em conferência" | Juntar em "Equipe analisa". Apagar só se nenhuma FK impedir: `opportunity_losses.stage_id_at_loss` e o histórico apontam para elas |
| 3 | Eventos para a Meta | LeadSubmitted ao entrar em "Em conferência", QualifiedLead em "Qualificada", Purchase no ganho. Isso muda o sinal das campanhas, então confirmar |
| 4 | Perda imediata | NÃO SE ENCAIXA → Perdido, com o detalhe que o agente escolher dentro do motivo "Sem direito" (AA1–AA6) |
| 5 | Perda por silêncio | 72 h depois do último follow-up sem resposta: Nova conversa → BB1, Em conferência → BB2, Qualificada → BB3. Nunca em "Equipe analisa" nem em "Contrato enviado", que são da equipe |
| 6 | Lead que volta depois de perdida | Confirmar a regra atual (nova oportunidade ou reabrir) antes da Fase 3 |

> **Atualização 26/11:** o PR #318 (já no main) deu ao `end_conversation` o `loss_code`: encerrar a conversa também perde a oportunidade com o motivo do catálogo, ligado por agente em `tool_settings.end_conversation.mark_lost`. Por isso o `classify_lead` **só move etapa**; o "não se encaixa" (decisão 4 da Fase 0) passa pelo `end_conversation` do #318. A perda por silêncio continua neste plano, porque nada mais cobre esse caso.

## Fase 1: parar o follow-up depois da despedida (pequena, primeiro por causa do RED)

- Ligar também `tool_settings.end_conversation.mark_lost` na Gabi (PR #318), para que o encerramento já marque a perda com o motivo.

- Ligar `end_conversation` na Gabi. O prompt v28 muda o mínimo possível: na 17.2, depois da despedida de NÃO SE ENCAIXA, chamar `end_conversation`. Não mexer no foco de venda, nas perguntas nem nas objeções.
- Conferir no código se `fn_agent_followup_claim` exclui as conversas com `ai_agent_closed_at`. Se não excluir, corrigir isso nesta fase.
- Proteção no servidor, independente do modelo: o follow-up não sai se a última mensagem do agente for uma despedida registrada (`end_conversation`).
- Teste: o simulador com 3 casos de não-encaixe; um teste unitário do gate de follow-up; depois, em produção, acompanhar o "follow-up depois da despedida" até chegar a 0.
- Rollback: tirar `end_conversation` de `enabled_tools`, voltando à versão anterior.

## Fase 2: a ferramenta `classify_lead` (genérica)

- Configuração em `tool_settings.classify_lead`:
  - `enabled`;
  - `mode` (`shadow` | `apply`);
  - `outcomes[]`, cada um com `key`, `label`, a descrição para o modelo e o `stage_id` de destino (a perda fica com o `end_conversation` do #318).
- O enum da ferramenta e as descrições saem dessa configuração. O modelo só escolhe entre os resultados configurados.
- No servidor, a lógica de decisão fica numa função pura em `_shared/intelligence/`, para dar teste unitário:
  1. Acha a oportunidade aberta do contato, como o `send_contract` faz.
  2. Aplica a regra de só avançar.
  3. Move pela `transition_opportunity_stage_v1` com `_source: "ai_agent_funnel"`.
  4. Grava uma nota interna na conversa com a classificação e o motivo, para a equipe ver o porquê.
- Idempotência: repetir o mesmo resultado não faz nada. A transição trava a linha (`FOR UPDATE`) e a perda exige a oportunidade aberta.
- Modo sombra: grava só a nota interna e o log `[classify_lead] would_*`, sem mover nada.
- Tela: um cartão "Funil pelo agente" na configuração do agente, com etapa e motivos escolhidos por select.
- Simulador: responde o que faria, sem gravar.
- Testes:
  - unitários da função de decisão: só avança, ganho e perda intocados, conversa com a equipe, resultado sem configuração, detalhe fora da lista;
  - simulador com 10 casos fictícios;
  - `bun run build`.

## Fase 3: movimento por regra (sem depender do modelo)

Configurado no mesmo cartão:
- **`reply_stage_id`:** quando a lead responde ao agente pela primeira vez, a oportunidade vai de "Nova conversa" para "Em conferência".
- **`handoff_stage_id`:** quando o agente usa `transfer_to_human` sem ter classificado o caso, a oportunidade vai para "Equipe analisa", sempre só avançando. Isso cobre o caso em que o modelo esquece de classificar.
- **Perda por silêncio:** um passo novo na rotina `agent-followups`.
  - Só para conversas com o agente, com os follow-ups esgotados, sem resposta por N horas e com a oportunidade aberta numa etapa que tenha regra de silêncio.
  - Limite de lote por execução.
  - Não envia nenhuma mensagem.
- Testes: unitários da regra de silêncio, e o simulador e a rotina com dados fictícios em modo sombra.

## Fase 4: ligar na Auxilius

1. Ajustar as etapas pela tela, conforme as decisões 1 e 2 da Fase 0.
2. Ajustar as regras da CAPI pela tela, conforme a decisão 3.
3. Prompt v29: na 17.2, chamar `classify_lead` ao chegar a um resultado. A mudança é mínima e sai como versão nova, com `current_version` atualizado.
4. Ligar o modo sombra por 48 h. Revisar 30 decisões contra a conversa, com a meta de 0 perdas indevidas.
5. Passar para `apply`.
6. Acompanhar por uma semana:
   - etapas com contagem coerente;
   - LeadSubmitted e QualifiedLead aparecendo em `capi_event_log`;
   - "perdidas pela IA" com motivo;
   - follow-ups sem resposta caindo.

## Fase 5: arrumar as 597 abertas (uma vez só, com aprovação)

- **Relatório a seco primeiro:** para cada oportunidade, a etapa ou a perda proposta e a evidência (resumo da passagem, despedida, silêncio). Ninguém aprova sem ver o relatório.
- **A CAPI não dispara na arrumação.** O lote marcaria dezenas de eventos ao mesmo tempo e distorceria o sinal das campanhas.
  - Mudança: `fn_capi_trigger_stage_rules` ignora quando `current_setting('app.capi_skip', true) = 'on'`, e o lote liga essa opção na transação (migração `20261127100000`).
  - Teste SQL cobrindo isso.
- Aplicar em lote com `automation_ref = funil-backfill-2026-11` para poder desfazer: reabrir pelo `reopen_opportunity_v1` filtrando por esse ref.

## Riscos e mitigação

| Risco | Mitigação | Teste |
|---|---|---|
| O agente perde uma lead boa | Perde só com NÃO SE ENCAIXA e um detalhe do catálogo; 48 h de sombra com revisão; nota interna com o porquê; lista "perdidas pela IA"; reabertura pelo `reopen_opportunity_v1`; a lead que volta continua sendo atendida (Fase 0 #6) | Unitário + simulador + revisão da sombra |
| O agente desfaz uma mudança da equipe | Só avança; não age em conversa passada ou atribuída; ganho e perda intocados | Unitário |
| Distorção na CAPI | Mapeamento decidido na Fase 0; arrumação sem CAPI; conferir `capi_event_log` depois de ligar | Teste SQL da opção de pular |
| A política da org bloqueia a mudança de etapa | A política em enforce vale para o ganho; conferir se avalia etapas que não são de ganho. Se bloquear, registrar na nota e não insistir | Integração no ambiente de teste |
| Perda por silêncio cedo demais | Prazo configurável, começando em 72 h; etapas da equipe fora; a lead que volta é atendida | Unitário |
| Quebrar outro agente (CT, Plamev) | A ferramenta é nova e opcional; o `update_qualification` fica como está; nada fixo por org | Revisão do diff |

## Fora do escopo (anotado)

- `first_human_response_at` não é preenchido nas conversas passadas pelo agente; isso distorce o relatório de tempo de resposta.
- 13 conversas passadas por "áudio não entendido" estão sem resposta da equipe há mais de 24 h.
- Erro "non-empty content" no loop de ferramentas.
