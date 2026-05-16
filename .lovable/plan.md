## Objetivo
Fazer com que o clique em **Salvar configurações** realmente persista `auto_send_whatsapp` e `whatsapp_template_id` na `organization_integrations`, para que o fluxo do Meta Lead Ads volte a disparar o template automático.

## O que vou implementar
1. **Corrigir o save do SettingsCard**
   - Revisar `src/components/integrations/meta-lead-ads/SettingsCard.tsx` para garantir que o update esteja sendo feito na linha correta e com o payload correto.
   - Endurecer a mutação para não tratar como sucesso um update que não alterou nada.
   - Fazer o save retornar a linha atualizada e validar explicitamente que `config_values.meta_lead_ads_settings` ficou persistido.

2. **Eliminar estado visual enganoso no modal**
   - Ajustar o fluxo entre `IntegrationsSettings.tsx` e `MetaLeadAdsDialog.tsx` para que o modal sempre trabalhe com dados frescos.
   - Corrigir a sincronização do estado local do formulário para reagir a mudanças reais em `config_values`, não só ao `id` da integração.
   - Invalidar/refetch das queries certas após salvar para evitar a UI mostrar “ON” quando o banco ainda está “OFF”.

3. **Validar o fluxo ponta a ponta**
   - Confirmar no banco que `auto_send_whatsapp` virou `true` e que o `whatsapp_template_id` ficou salvo.
   - Verificar os logs de `meta-lead-ads-process-lead` para confirmar que o eval passou a mostrar `autoSend: true`.
   - Fazer um novo teste de lead e conferir se `twilio-whatsapp-send` é invocada.

## Evidência já confirmada
- A linha atual da org `b246ef6f-6242-4011-a112-6d8783d2896a` continua salva no banco com:
  - `auto_send_whatsapp: false`
  - sem `whatsapp_template_id`
  - `updated_at` antigo (`2026-05-07`)
- Os logs recentes de `meta-lead-ads-process-lead` ainda mostram:
  - `autoSend: false`
  - `tplId: null`
- Ou seja: o problema agora está na **persistência/frontend**, não no disparo da edge function.

## Detalhes técnicos
- Arquivos principais:
  - `src/components/integrations/meta-lead-ads/SettingsCard.tsx`
  - `src/components/integrations/meta-lead-ads/MetaLeadAdsDialog.tsx`
  - `src/components/settings/IntegrationsSettings.tsx`
- Não pretendo mexer no banco nem em migrations neste passo.
- Só mexo no backend se, após corrigir o save, os logs ainda mostrarem configuração stale.