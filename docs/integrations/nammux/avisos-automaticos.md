# Avisos automáticos ao cliente (integração Nammux)

Avisos que o cliente recebe sobre o processo, sem ninguém digitar: audiência
marcada, lembretes, pagamento, movimentação. Nascem dos eventos que o Nammux
envia e saem pelo aplicativo do cliente ou por WhatsApp.

Tudo desligado por padrão. A organização liga com a flag `nammux_notices`
(`integration_feature_flags`).

## Os avisos

| Tipo (`kind`) | Quando sai | Passa por pessoa (padrão) |
|---|---|---|
| `event_scheduled` | audiência, perícia ou entrevista marcada | não |
| `event_rescheduled` | mudou de data | não |
| `event_cancelled` | cancelada sem nova data | não |
| `event_reminder_7d` | 7 dias antes | não |
| `event_reminder_1d` | véspera (24 h antes) | não |
| `event_reminder_1h` | 1 h antes | não |
| `event_starting` | 15 min antes ("está iniciando") | não |
| `interview_slot_unavailable` | o horário de entrevista escolhido já tinha sido tomado | não |
| `agreement_homologated` | o juiz homologou o acordo | não |
| `installment_paid` | a empresa pagou a parcela | não |
| `installment_overdue` | a parcela venceu sem pagamento | não |
| `payout_done` | repasse feito — **desligado por padrão** | não |
| `movement_update` | movimentação do catálogo marcada para avisar | não |
| `movement_unfavorable` | movimentação desfavorável | **sim** |

A regra de cada tipo fica em `nammux_notice_rules`: uma linha com
`organization_id` nulo é o padrão; uma linha da organização o substitui
(`enabled`, `requires_approval`).

## Texto de cada aviso

É o texto a cadastrar como modelo de WhatsApp (categoria utilidade) em cada
organização, com as variáveis nesta ordem. A fonte é
`_shared/integrations/nammux-notice-texts.ts` (`NOTICE_TEMPLATES`); mudou lá,
muda o modelo. **Os textos são proposta e precisam de revisão antes de ir à Meta.**

| Tipo | Texto | Variáveis |
|---|---|---|
| `event_scheduled` | Olá! Sua {{1}} foi marcada para {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem. | 1 tipo · 2 data · 3 hora · 4 como participar |
| `event_rescheduled` | Atenção: sua {{1}} mudou de data. A nova data é {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem. | idem |
| `event_cancelled` | Sua {{1}} do dia {{2}} foi cancelada. Assim que houver nova data, avisamos você por aqui. | 1 tipo · 2 data |
| `event_reminder_7d` | Lembrete: sua {{1}} é {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem. | 1 tipo · 2 data · 3 hora · 4 como participar |
| `event_reminder_1d` | Lembrete: sua {{1}} é amanhã, {{2}}, às {{3}}. {{4}} Se tiver dúvida, é só responder esta mensagem. | idem (audiência e perícia) |
| `interview_reminder_1d` (modelo da véspera da **entrevista**, botões "Vou participar" / "Preciso remarcar") | Lembrete: sua entrevista com a equipe do escritório é amanhã, {{1}}, às {{2}}. {{3}} Você vai conseguir participar? | 1 data · 2 hora · 3 como participar |
| `event_reminder_1h` | Sua {{1}} começa em 1 hora, às {{2}}. {{3}} Se tiver algum problema, responda esta mensagem. | 1 tipo · 2 hora · 3 como participar |
| `event_starting` | Sua {{1}} está começando agora. Entre o quanto antes para não perder o horário. {{2}} Se tiver algum problema para entrar, responda esta mensagem. | 1 tipo · 2 como participar |
| `interview_slot_unavailable` | O horário que você escolheu para a entrevista ({{1}}) acabou de ser ocupado. Me diga outro horário que funcione para você e eu vejo o que está livre. | 1 dia e hora pedidos |
| `agreement_homologated` | Boa notícia: o juiz homologou o acordo do seu processo em {{1}}. Quando houver pagamento, avisamos você por aqui. | 1 data |
| `installment_paid` | A empresa pagou a parcela {{1}} do acordo. O escritório vai fazer o repasse da sua parte e avisa você. | 1 "2 de 6" |
| `installment_overdue` | A empresa não pagou a parcela {{1}} do acordo, que venceu em {{2}}. Vamos nos manifestar no processo em até 5 dias úteis, até {{3}}. Qualquer novidade, avisamos você por aqui. | 1 "2 de 6" · 2 vencimento · 3 prazo |
| `payout_done` | O repasse de {{1}} referente ao seu processo foi feito em {{2}}. Se tiver dúvida, é só responder esta mensagem. | 1 valor · 2 data |
| `movement_update` / `movement_unfavorable` | Novidade no seu processo: {{1}} Se tiver dúvida, é só responder esta mensagem. | 1 texto do catálogo do Nammux |

"Tipo" é audiência, perícia ou entrevista. "Como participar" é o link, o local,
ou "O escritório vai informar como participar." Não há nome, telefone nem e-mail
do cliente em nenhum texto.

O texto **não fica guardado na fila**: o worker monta a mensagem na hora do
envio, com o estado atual. Se o link mudou depois do planejamento, o lembrete
sai com o link novo; se a audiência foi remarcada, o lembrete da data antiga
não sai.

## Sem aviso em dobro

1. O aviso é planejado na mesma transação que aplica o evento do Nammux, e o
   evento tem recibo: entregue duas vezes, é aplicado uma.
2. Cada aviso tem `dedup_key` única por organização. Exemplos:
   `event_announce:<raiz>:<data>`, `event_reminder_1d:<raiz>:<data>`,
   `installment_paid:<parcela>:<data do pagamento>`,
   `installment_overdue:<parcela>:<vencimento>`, `movement:<movimentação>`.
   A raiz é o primeiro compromisso de uma cadeia de remarcações.
3. Remarcou → os avisos pendentes da data antiga são cancelados. O que já saiu
   não é alterado.
4. Carga inicial e reparo (`reason` diferente de `live`) criam lembretes, nunca
   o "foi marcada".

## Horário

Aviso comum sai entre 08:00 e 20:00 (horário de Brasília); fora disso espera o
próximo horário permitido — a menos que esperar passasse de 2 h antes do
compromisso, e aí sai na hora. Lembrete de 1 h e "está iniciando" são presos à
hora do compromisso e não têm horário de silêncio. Compromisso sem hora
definida (dia inteiro) tem só os lembretes de 7 dias e de véspera, às 10:00.

## Canal

1. **Aplicativo do cliente**, quando a organização tem o App configurado
   (`CLIENT_PORTAL_NOTIFY_URL`). O backend do App responde `delivered` ou
   `no_device`; o id do aviso vai como `clientNotificationId` para o App não
   notificar duas vezes. **Esse endpoint ainda não existe no App**: enquanto
   não existir, o passo é pulado.
2. **WhatsApp**, pelo número da linha de Atendimento da organização:
   - janela de 24 h aberta, ou número Evolution → texto livre;
   - janela fechada → modelo aprovado mapeado em `nammux_notice_templates`;
   - sem modelo → o aviso para em `skipped: no_template` e aparece na tela.

Antes de enviar o worker confere: prazo (`expires_at`), se o contato existe,
`contacts.do_not_contact`, e se o estado de agora ainda corresponde ao aviso.

Também confere se o contato é a parte do processo: compara o nome do contato com
o nome do autor no título do processo ligado à oportunidade
(`nammux_process_snapshots.process_title`, "AUTOR x RÉU"). Se forem pessoas
diferentes (primeiro nome diferente e menos de dois nomes em comum), o aviso não
sai e vai para `needs_review: contact_name_mismatch`. Isso pega vínculo
processo↔oportunidade trocado. Se o contato for parente ou representante, uma
pessoa aprova na revisão e o aviso sai sem nova conferência. Título sem nome
(provisório, emoji) não barra. Regra em
`_shared/integrations/client-name-match.ts`.

## Falha e reenvio

| O que aconteceu | Desfecho |
|---|---|
| O provedor recusou com um código | volta para a fila: nova tentativa em 1, 5, 15 e 60 min; na 5ª falha, `dead_letter`. Nunca depois do prazo |
| Problema de modelo (não aprovado, conta errada) | `skipped`, com o motivo — repetir não resolve |
| Sem resposta, tempo esgotado, erro 5xx | **não reenvia**: `needs_review`. A mensagem pode ter saído |
| O worker caiu no meio do envio | o recuperador move para `needs_review` após 5 min |
| Passou do prazo sem sair | `expired` |

## Pessoa antes da notícia ruim

Tipo com `requires_approval` nasce em `pending_approval`. Quem tem Atendimentos
(ver e editar) na organização aprova ou recusa por
`nammux_notice_decide(_notice_id, _approve, _reason)`. Aprovar depois do prazo
expira o aviso. Também passam por aqui os avisos em `needs_review` e
`dead_letter`. Um caso não é reenviável: "a empresa pagou" que já saiu e teve o
pagamento estornado — a pessoa só dá baixa.

## Tela

`/inbox/avisos` (menu Atendimento → "Avisos ao cliente", com contador). Lista o
que espera uma pessoa e o que não saiu nos últimos 7 dias, com a mensagem que o
cliente receberia — montada pelo mesmo código que o worker usa para enviar. A
tela fala só com a edge function `nammux-notices-review`, que confere a
permissão no banco com a identidade de quem chamou.

## Para ligar numa organização

1. Cadastrar e aprovar os modelos na Meta e mapeá-los em `nammux_notice_templates`.
2. Ajustar `nammux_notice_rules` se o padrão não servir.
3. Ligar a flag `nammux_notices`.

## Véspera da entrevista: presença

A véspera da entrevista usa o modelo `interview_reminder_1d` (mapeado em
`nammux_notice_templates` com esse `kind`), com os botões de resposta rápida
"Vou participar" e "Preciso remarcar". Com a janela de 24 h aberta, sai como
mensagem com os mesmos botões. A resposta é lida sem o modelo
(`_shared/integrations/nammux-interview-presence.ts`, no `ai-agent-respond` do
agente de atendimento): "Vou participar" recebe uma resposta fixa; "Preciso
remarcar" segue para o agente com a instrução de oferecer outros horários.
Nenhum modelo começa ou termina com variável (regra da Meta; há teste).

## Avisos de agenda pedidos pelo Nammux

Decisão: o Nammux é o único dono de **quando** o cliente é avisado sobre
audiência, perícia e entrevista. Ele planeja os avisos e, na hora de enviar,
manda o evento `client.notice.requested` com o estado do compromisso naquele
momento (`data.kind`, `data.notice_key`, `data.expires_at`,
`data.seialz_opportunity_id` e `data.event`, no mesmo formato do `event` de
`process.agenda.changed`).

O Seialz só entrega. `nammux_apply_client_notice` grava o aviso na fila
(`nammux_notices.subject_type = 'source_event'`, com o estado em `payload` e
chave `src:<notice_key>`), e o worker monta o texto a partir desse estado
(`eventStateFromSource`), sem ler o espelho. Valem as mesmas regras de
entrega: aplicativo antes, janela de 24 h, modelo aprovado, quem não quer
contato e aprovação por tipo.

Com a flag `nammux_notices_planned_by_source` ligada na organização, o Seialz
deixa de planejar avisos de agenda a partir de `nammux_process_events`. A
confirmação de pedidos de entrevista continua.

