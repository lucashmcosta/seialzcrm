# Corrigir /marketing/ads vazio após filtro de data

## Diagnóstico

Antes do filtro de data, a página consultava direto a view `vw_marketing_ad_performance`. Essa view é owned pelo `postgres` e **roda como definer**, ignorando RLS — por isso funcionava.

Quando adicionei o filtro de data, a página passou a chamar a RPC `get_marketing_ad_performance`, que foi criada como `SECURITY INVOKER`. A RPC roda como o usuário e bate na RLS da tabela `marketing_campaigns`:

```sql
organization_id IN (
  SELECT organization_id FROM user_organizations
  WHERE user_id = auth.uid() AND is_active = true
)
```

O problema: `user_organizations.user_id` é o **id interno** (`users.id`), não o `auth.uid()`. Essa policy nunca casa com nenhum registro — então a RPC devolve 0 linhas, e a UI mostra "Nenhum ad encontrado", mesmo havendo 20 ads na Central Trabalhista.

Confirmei via DB:
- 20 ads para a org, 0 retornados via RLS atual.
- Chamando a RPC como service role com mesmo filtro de "Ontem" → 20 linhas.

## Correção (1 arquivo)

Criar nova migration que recria `public.get_marketing_ad_performance` como `SECURITY DEFINER` com guard explícito de acesso:

```sql
SECURITY DEFINER
SET search_path = public
-- início do corpo:
  IF p_organization_id IS NULL
     OR NOT (p_organization_id = ANY(public.current_user_org_ids()))
  THEN RETURN; END IF;
```

Mantém toda a lógica/colunas atuais. Sem alterações no frontend.

## Fora de escopo

A policy `marketing_campaigns_org_isolation` continua quebrada para outros consumidores diretos da tabela. Posso corrigir num passo seguinte, mas isso afeta vários módulos e merece teste isolado — vou tratar separadamente se você quiser.

## Arquivos

- `supabase/migrations/<novo>.sql` — recria a RPC com SECURITY DEFINER + guard.
