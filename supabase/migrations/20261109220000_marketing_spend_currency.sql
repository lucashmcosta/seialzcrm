-- Gasto de conta de anúncio em moeda diferente da org. O sync gravava o valor da conta como se fosse da org, então
-- US$ 95 aparecia como R$ 95 e distorcia CPL, CAC e ROAS.
--
-- spend_cents passa a ser sempre na moeda da org: telas e cálculos seguem lendo a mesma coluna.
-- spend_currency e spend_original_cents guardam o que a Meta informou, para conferir com o gerenciador.
-- fx_rate é a cotação usada; a linha guarda a do dia dela, então o passado não muda quando o dólar muda.
ALTER TABLE public.marketing_campaign_insights_daily
  ADD COLUMN IF NOT EXISTS spend_original_cents bigint,
  ADD COLUMN IF NOT EXISTS fx_rate numeric(14,6),
  ADD COLUMN IF NOT EXISTS fx_rate_date date;

-- Cotações oficiais (PTAX), públicas e iguais para todas as orgs. Só o backend grava.
CREATE TABLE IF NOT EXISTS public.fx_rates (
  currency text NOT NULL,
  rate_date date NOT NULL,
  rate_brl numeric(14,6) NOT NULL CHECK (rate_brl > 0),
  source text NOT NULL DEFAULT 'bcb_ptax',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (currency, rate_date)
);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
