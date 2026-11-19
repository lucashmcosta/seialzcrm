-- Entrevista: o cliente confirma no botão antes de o pedido ir ao Nammux.
--
-- O agente de atendimento grava o horário escolhido como `proposed` (sem
-- evento de saída). Quando o cliente toca em "Confirmar", a proposta vira
-- `accepted` e só então nammux_request_interview cria o pedido `requested` e
-- enfileira `entrevista.agendada`. "Outro horário" fecha como `declined`; uma
-- proposta nova na mesma conversa fecha a anterior como `expired`.
--
-- nammux_request_interview e a confirmação/recusa vindas do Nammux continuam
-- olhando só `requested`/`confirmed`: propostas não ocupam horário nem geram aviso.

alter table public.nammux_interview_requests
  drop constraint if exists nammux_interview_requests_status_check;
alter table public.nammux_interview_requests
  add constraint nammux_interview_requests_status_check
  check (status in ('requested', 'confirmed', 'rejected', 'proposed', 'accepted', 'declined', 'expired'));

create index if not exists idx_nammux_interview_requests_propostas
  on public.nammux_interview_requests (organization_id, thread_id, created_at desc)
  where status = 'proposed';
