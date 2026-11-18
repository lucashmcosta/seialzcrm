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

## Autenticação
Credenciais por org em `organization_integrations` (cifradas).

## Dívida
Documentos comuns vinculados somente ao contato ainda exigem uma política
explícita de roteamento quando o contato possui vários processos. A exceção
deliberada são contratos SuvSign, conforme ADR-0010. Ver também
`docs/audit/07-divida-tecnica.md`.
