-- Texto do anúncio para a conversa: a Meta só manda o texto em parte dos leads.
-- Devolve apenas o texto do anúncio, nunca dado de contato, e só para quem é da org.
create or replace function public.rpc_ad_referral_text(_org uuid, _source_id text)
returns text language sql stable security definer set search_path to 'public' as $$
  select c.ad_referral_body
  from contacts c
  where c.organization_id = _org
    and c.ad_referral_source_id = _source_id
    and nullif(btrim(c.ad_referral_body), '') is not null
    and c.deleted_at is null
    and exists (
      select 1 from user_organizations uo
      where uo.user_id = public.current_user_id() and uo.organization_id = _org and uo.is_active = true
    )
  group by c.ad_referral_body
  order by count(*) desc, c.ad_referral_body
  limit 1;
$$;
revoke all on function public.rpc_ad_referral_text(uuid, text) from public, anon;
grant execute on function public.rpc_ad_referral_text(uuid, text) to authenticated;
