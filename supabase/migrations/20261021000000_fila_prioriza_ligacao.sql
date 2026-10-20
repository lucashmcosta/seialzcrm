-- Ligacao passa na frente na fila da Inteligencia.
--
-- Medido em 20/10/2026: entre a ligacao acabar e a transcricao ficar pronta
-- deu de 1h a 3h34, porque o job da ligacao entrava atras de milhares de
-- analises de mensagem e esperava a vez. Analise de mensagem pode esperar --
-- ninguem esta parado por ela. A transcricao da entrevista, sim: a pessoa
-- acabou de desligar e quer completar a ficha com a transcricao do lado.
--
-- Muda SO a ordem do claim. Nao mexe em quem pode ser pego (`status`,
-- `next_run_at`, `attempts`), entao retry com backoff continua igual: um job
-- de ligacao reagendado para daqui a 5 minutos continua esperando 5 minutos;
-- ele so nao espera a fila.
--
-- A desempatar continua `next_run_at`, entao dentro de cada grupo a ordem e a
-- mesma de antes -- o mais antigo primeiro.

create or replace function public.rpc_claim_intelligence_jobs(p_limit integer default 10)
returns setof intelligence_jobs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT j.id
    FROM public.intelligence_jobs j
    WHERE j.status IN ('pending','failed')
      AND j.next_run_at <= now()
      AND j.attempts < j.max_attempts
    ORDER BY
      -- 0 = alguem esta esperando agora; 1 = pode esperar
      CASE WHEN j.target_action IN (
             'intelligence.archive_recording',
             'intelligence.transcribe_call'
           ) THEN 0 ELSE 1 END,
      j.next_run_at
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.intelligence_jobs j
  SET status = 'running',
      started_at = now(),
      attempts = j.attempts + 1
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*;
END;
$function$;

comment on function public.rpc_claim_intelligence_jobs(integer) is
  'Pega os proximos jobs. Ligacao (arquivar e transcrever) vem primeiro: alguem acabou de '
  'desligar e esta esperando. Dentro de cada grupo, o mais antigo primeiro.';
