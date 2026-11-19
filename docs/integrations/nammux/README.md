# Nammux (ERP)

**Referência técnica:** `docs/audit/04-integracoes/nammux.md`.

## Finalidade
Integração com ERP Nammux para sincronizar oportunidades e anexos.

## Edge functions
- `nammux-test-connection`
- `nammux-audit` — ⚠ ainda chama `httpbin.org` (dívida — remover).
- `nammux-replay-opportunity`
- `nammux-reconcile-opportunities`
- `nammux-download-attachment`

## Documentos pós-venda

Documentos vinculados diretamente a uma oportunidade já ganha geram um replay
focado pelo outbox quando `include_opportunity_attachments` está habilitado. A
chave é determinística por documento e o trigger não faz chamadas de rede. Ver
[ADR-0010](../../decisions/0010-post-win-document-sync.md).

Contratos assinados confirmados pelo SuvSign são documentos do contato. Um
único arquivo é incluído em todas as oportunidades ganhas desse contato e cada
replay reutiliza o mesmo `document.id`, permitindo que o Nammux mantenha um
documento canônico com vários vínculos de processo. Arquivos manuais não são
promovidos a contrato pela simples correspondência do nome.

## Eventos recebidos do Nammux (`nammux-webhook-ingest`)

O Nammux envia eventos assinados (HMAC por organização). O ingest valida
assinatura, organização e mapeamento e trata cada tipo:

| Evento | O que faz | Onde grava |
|---|---|---|
| `process.snapshot.updated` | retrato do processo (etapa, situação, responsável) | `nammux_process_snapshots` |
| `process.sync.failed` | marca o retrato com erro | `nammux_process_snapshots` |
| `contact.address.updated` | endereço do contato | RPC `apply_nammux_contact_address` |
| `classification.certified` | certificação da classificação pela entrevista | RPC `pc_record_certification` |
| `process.agenda.changed` | audiência, perícia ou entrevista marcada, remarcada, cancelada ou concluída | `nammux_process_events` |
| `process.finance.changed` | estado de um acordo, de uma parcela ou de um repasse | `nammux_process_finance` |
| `process.movement.added` | movimentação relevante do tribunal, já com texto em linguagem simples | `nammux_process_movements` |
| `interview.booking.rejected` | o horário de entrevista pedido já não estava livre | `nammux_interview_requests` |
| `client.notice.requested` | o Nammux pede para avisar o cliente sobre um compromisso (ele planeja; o Seialz só entrega) | `nammux_notices` (`source_event`) |

Tipo novo entra em `nammux-webhook-ingest/handlers.ts` (uma linha no mapa) com
uma RPC `nammux_apply_*`. A RPC registra o recibo do evento
(`nammux_inbound_receipt`) e grava o estado na mesma transação: o mesmo evento
entregue duas vezes é aplicado uma vez, e uma versão mais antiga que chega
depois da nova é ignorada (`source_version`).

Respostas: `200` aplicado, duplicado ou versão antiga; `409` recusa definitiva
(payload fora do contrato, negócio inexistente) — o Nammux não reenvia; `5xx`
falha transitória — o Nammux reenvia com espera crescente.

O evento financeiro traz o estado, não o que aconteceu. `nammux_finance_upsert`
compara com o estado anterior e deduz a transição (`agreement_closed`,
`agreement_homologated`, `installment_paid`, `installment_overdue`,
`payment_reversed`, `payout_done`, `payout_reversed`) na mesma transação que
grava o novo — por isso cada uma sai uma vez, mesmo com reentrega ou fora de
ordem. `nammux_process_finance` é só `service_role`: traz apenas a parte do
cliente em cada parcela, e ninguém lê pela tela.

O payload de cada evento novo tem um arquivo de contrato em
`supabase/tests/fixtures/nammux/`, igual ao do repositório do Nammux. Um teste
de cada lado garante que produtor e consumidor continuam de acordo.

## Dados do processo para o agente de atendimento

`_shared/integrations/nammux-process-context.ts` monta o que o agente de
atendimento (`agent_type = 'support'`) sabe do processo do cliente. Só esse
tipo de agente recebe: para qualquer outro, inclusive o comercial (`sdr`), a
função devolve vazio sem consultar o banco.

| Bloco | Fonte | Flag por organização (`integration_feature_flags`) |
|---|---|---|
| Processos do cliente | `nammux_process_snapshots` | — (sempre) |
| Próximas datas | `nammux_process_events` | `nammux_agent_agenda` |
| Acordo e pagamentos | `nammux_process_finance` | `nammux_agent_finance` |
| Últimas movimentações | `nammux_process_movements` | `nammux_agent_movements` |

O texto de cada movimentação vem pronto do catálogo do Nammux
(`seialz_movimentacao_catalogo`), revisado pelo jurídico. O Seialz não gera nem
reescreve esse texto, e nenhuma IA participa: o agente só repete o que recebeu.

Com a flag desligada o agente recebe o mesmo texto de antes.

## Entrevista agendada pelo cliente

O cliente marca ou remarca a entrevista conversando com o agente de atendimento.
O Nammux é a fonte única da agenda: o Seialz não guarda horário.

1. `nammux_interview_slots` (ferramenta do agente) consulta os horários livres na
   edge function `seialz-interview-slots` do Nammux, com chamada assinada
   (`_shared/integrations/nammux-client.ts`).
2. O cliente escolhe. `nammux_schedule_interview` consulta a agenda de novo e
   grava o horário como **proposto** (`nammux_interview_requests.status =
   'proposed'`, sem evento de saída). Depois do texto do agente vão os botões
   "Confirmar" e "Outro horário" (`clientInteractive` da ferramenta).
3. O toque do cliente é lido sem o modelo
   (`_shared/integrations/nammux-interview-confirm.ts`, chamado no
   `ai-agent-respond` antes do modelo). "Confirmar" fecha a proposta como
   `accepted`, consulta a agenda outra vez e só então chama
   `nammux_request_interview`, que grava o pedido `requested` e o evento
   `entrevista.agendada` em `integration_events` na mesma transação. O
   `integration-worker` entrega pelo handler `nammux:send_interview_scheduled`.
   "Outro horário" fecha como `declined` e o agente oferece outros. Proposta
   sem toque em 2 horas deixa de valer; uma proposta nova na mesma conversa
   fecha a anterior como `expired`. Propostas não ocupam horário no Nammux.
4. O Nammux confere o horário outra vez e cria ou remarca a entrevista.
5. A volta: `process.agenda.changed` com a entrevista confirma o pedido;
   `interview.booking.rejected` o recusa. A mensagem de entrevista marcada ao
   cliente é o aviso `event_scheduled` (flag `nammux_notices`).

A entrevista é com a equipe do escritório, não com o advogado.

As ferramentas seguem o contrato das ferramentas de widget, e só entram para
`agent_type = 'support'` com a flag `nammux_interview_scheduling` ligada na
organização (`nammuxToolsForAgent`). No modo de teste do agente nada é enviado
ao Nammux.

## Avisos automáticos ao cliente

Detalhe completo, com o texto de cada aviso: [`avisos-automaticos.md`](./avisos-automaticos.md).

- **Fila** `nammux_notices`. O aviso é planejado na mesma transação que grava o
  estado vindo do Nammux (ganchos `nammux_after_*`) e tem uma chave de negócio
  única por organização: reentrega, reparo e remarcação nunca produzem dois.
- **Regras** `nammux_notice_rules`: padrão global, com ajuste por organização
  (ligar, desligar, exigir aprovação). **Modelos** `nammux_notice_templates`.
- **Worker** `nammux-notice-dispatch`, a cada minuto. Confere o estado de agora,
  escolhe o canal (aplicativo; senão WhatsApp) e registra o desfecho. Resultado
  incerto não é reenviado: vai para revisão.
- **Liga por organização** com a flag `nammux_notices`. Desligada, nada é planejado.

## Autenticação
Credenciais por org em `organization_integrations` (cifradas).

## Dívida
Documentos comuns vinculados somente ao contato ainda exigem uma política
explícita de roteamento quando o contato possui vários processos. A exceção
deliberada são contratos SuvSign, conforme ADR-0010. Ver também
`docs/audit/07-divida-tecnica.md`.

## Datas e andamento: consulta na hora

O Seialz não guarda cópia da agenda nem das movimentações para mostrar ou
responder. Quem precisa consulta o Nammux na hora, pela edge function
`seialz-process-info` do Nammux (chamada assinada, mesmo segredo da
integração), que devolve as próximas datas e a linha do tempo do processo já
em linguagem simples (mesmo catálogo do app do cliente):

- agente de atendimento: `_shared/integrations/nammux-process-info.ts`, usado
  por `nammuxSupportContext` (blocos "PRÓXIMAS DATAS" e "ANDAMENTO DO
  PROCESSO"; linha sensível vai só com o título e passa para a equipe). Sem
  resposta do Nammux, o agente não fala de datas nem de andamento;
- aba do processo na oportunidade: edge function `nammux-process-view` (JWT do
  usuário; só responde se ele enxerga a oportunidade).

O financeiro do agente continua lendo `nammux_process_finance`.

