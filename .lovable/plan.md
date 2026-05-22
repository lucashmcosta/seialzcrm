## O que tem hoje

Na página da integração **Meta Lead Ads** (Configurações → Integrações → Meta Lead Ads) já tem uma aba **"Conexão"** com o componente `ConnectionForm.tsx` — é ali que se cola o System User Token. Mas esse formulário só salva pra parte de Leads. Não pede ad account nem liga a flag de sync de campanhas. Por isso o `/marketing` da Viagi não carrega.

## O que vou fazer (sem aba nova, mesma tela)

Estender o `ConnectionForm.tsx` existente pra cobrir tudo em um lugar só:

1. Campo **System User Token** (já existe) — onde o usuário cola o token da Meta.
2. Campo novo **App Secret** (opcional, recomendado).
3. Depois de salvar/validar o token, mostra um **`<Select>` de Ad Account** populado automaticamente via `meta-discover-ad-accounts` (edge function que já existe).
4. **Toggle** "Sincronizar campanhas e insights (módulo Marketing)" → grava `feature_ads_manager_sync = true`.
5. Botão **"Sincronizar agora"** → chama `meta-discover-ads-cron` + `marketing-insights-sync-daily` na hora.

Tudo salva no `connected_account` (token criptografado com `META_TOKEN_ENCRYPTION_KEY`, `ad_account_id` com prefixo `act_`, `business_id`) e em `config_values.feature_ads_manager_sync`. Vira o fluxo padrão multi-tenant — qualquer org futura cola token, escolhe conta, liga o toggle, pronto.

## Arquivos

**Edge function nova:** `supabase/functions/meta-ads-manager-save/index.ts`
- Recebe `{ organization_id, ad_account_id, ad_account_name, business_id, enable_sync }`.
- Garante prefixo `act_`.
- Merge em `connected_account` da integração Meta; se token estiver cru em row legada, criptografa e move pra row consolidada.
- Atualiza `config_values.feature_ads_manager_sync`.

**Frontend:**
- `src/components/integrations/meta-lead-ads/ConnectionForm.tsx` — adicionar bloco "Ads Manager" abaixo da conexão atual (Select de conta + toggle + botão sync). Sem nova aba, sem nova rota.

## Fix imediato pra Viagi

Depois do código pronto, abro a integração na Viagi, colo/reuso o token que já existe lá, seleciono `act_1145377357130771`, ligo o toggle, clico "Sincronizar agora". `/marketing` da Viagi passa a carregar.

## Sem migration
Nada de schema novo — tudo no JSONB que já existe.