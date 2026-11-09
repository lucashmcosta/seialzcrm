-- Status de pagamento das cotações Plamev (widget plamev_quote), consultado em Cotacoes/VerificarConversaoVenda.
-- A Plamev não tem webhook: a edge function plamev-quote consulta ao abrir o widget e a cada 15 min (pg_cron).
-- Com a adesão paga, registra o pagamento na linha do tempo e, se a org ligou a opção, marca a oportunidade como ganha.

alter table public.plamev_quotes
  add column if not exists virou_venda boolean not null default false,
  add column if not exists adesao_paga boolean not null default false,
  -- PAGA | ISENTA | PENDENTE | CANCELADA | ESTORNADA (null = sem venda ainda)
  add column if not exists adesao_situacao text,
  -- Nome da situação da venda na Plamev (Ativo, Aguardando Pagamento...)
  add column if not exists venda_situacao text,
  add column if not exists adesao_pago_em date,
  add column if not exists status_verificado_em timestamptz,
  -- Quando a nota de pagamento foi para a linha do tempo; trava para não registrar duas vezes (cron + widget).
  add column if not exists pagamento_registrado_em timestamptz;

-- Fila do cron: cotações ainda não pagas, as nunca/menos recentemente verificadas primeiro.
create index if not exists idx_plamev_quotes_pagamento_pendente
  on public.plamev_quotes (status_verificado_em nulls first)
  where adesao_paga = false;

-- Opção da org: marcar a oportunidade como ganha quando a Plamev confirmar a adesão paga (desligado por padrão).
alter table public.plamev_credentials
  add column if not exists marcar_ganha_ao_pagar boolean not null default false;

-- A função autentica o JWT da service_role ela mesma (action pagamentos_cron).
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'plamev-pagamentos';
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
    PERFORM cron.schedule(
      'plamev-pagamentos',
      '*/15 * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/plamev-quote',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
            )
          ),
          body := '{"action":"pagamentos_cron"}'::jsonb,
          timeout_milliseconds := 120000
        );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'plamev-pagamentos schedule skipped: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
