-- O Deepgram responde o modelo com prefixo: pede-se `nova-3`, ele devolve
-- `general-nova-3`. Como o custo passou a ser calculado pelo nome que ELE
-- responde (para o relatorio nao mentir), a tabela precisa dos dois nomes --
-- senao o custo fica nulo em silencio, que foi o que aconteceu no primeiro
-- teste do nova-3 em 20/10/2026.

insert into public.provider_pricing (provider, model, audio_per_minute_usd, effective_from)
select 'deepgram', 'general-nova-2', 0.0043, current_date
 where not exists (select 1 from public.provider_pricing
                    where provider='deepgram' and model='general-nova-2');

insert into public.provider_pricing (provider, model, audio_per_minute_usd, effective_from)
select 'deepgram', 'general-nova-3', 0.0077, current_date
 where not exists (select 1 from public.provider_pricing
                    where provider='deepgram' and model='general-nova-3');
