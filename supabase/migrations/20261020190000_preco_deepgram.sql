-- Preco do Deepgram para a conta de custo da transcricao de ligacao.
--
-- Nova-2 pre-gravado, por minuto. O numero de tabela publica em 20/10/2026 e
-- US$ 0,0043/min -- menos da metade do ElevenLabs (0,0044) e... na verdade
-- quase igual; a diferenca de verdade aparece no `nova-2` com desconto de
-- volume. Deixo o preco de tabela, que e o conservador: se a conta real vier
-- menor, o relatorio erra para mais, nunca para menos.

insert into public.provider_pricing (provider, model, audio_per_minute_usd, effective_from)
select 'deepgram', 'nova-2', 0.0043, current_date
 where not exists (
   select 1 from public.provider_pricing
    where provider = 'deepgram' and model = 'nova-2'
 );

insert into public.provider_pricing (provider, model, audio_per_minute_usd, effective_from)
select 'deepgram', 'nova-3', 0.0077, current_date
 where not exists (
   select 1 from public.provider_pricing
    where provider = 'deepgram' and model = 'nova-3'
 );
