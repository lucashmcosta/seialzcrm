# Telefonia V2 — rollout operacional

## Escopo entregue

A V2 mantém o atendimento WebRTC no navegador e introduz um domínio de telefonia neutro de provedor, com adapter Twilio inicial. O fluxo legado permanece disponível enquanto a flag `telephony_v2` estiver desabilitada para a organização.

O número individual tenta somente o titular. O número corporativo usa round-robin atômico, com até três usuários distintos e 15 segundos por tentativa. A elegibilidade combina autorização explícita do número, permissão do perfil, presença recente, DND, horário do número e ausência de chamada ativa.

## Pré-requisitos

Configurar os secrets das Edge Functions:

- `INTEGRATION_CREDENTIALS_KEY`: chave usada para criptografar Auth Token e API Secret.
- `TELEPHONY_WEBHOOK_PUBLIC_BASE_URL` (opcional): override da URL pública canônica sem rota final. Por padrão é derivada de `SUPABASE_URL` como `https://<project-ref>.supabase.co/functions/v1/telephony-webhook`.

Aplicar a migration `20260803120000_telephony_v2_foundation.sql` e publicar:

- `telephony-session-token`
- `telephony-call-intent`
- `telephony-webhook`
- `twilio-setup`
- `twilio-token`
- `twilio-call`
- `twilio-media-proxy`
- `twilio-webhook`

Após aplicar a migration, regenerar `src/integrations/supabase/types.ts` a partir do projeto para remover os casts temporários usados pelos campos aditivos.

## Piloto

1. Manter `feature_flags.telephony_v2.is_enabled = true` e adicionar somente a organização piloto em `organization_ids`.
2. Abrir Configurações > Integrações > Telefonia, revisar todos os números e salvar:
   - tipo e titular;
   - responsável por chamadas perdidas;
   - usuários autorizados para receber e originar;
   - número corporativo padrão;
   - horário, timezone, gravação e mensagem de fallback.
3. Confirmar que os perfis do piloto possuem `can_make_calls`, `can_receive_calls`, `can_view_all_calls` e `can_manage_telephony` conforme a função de cada usuário.
4. Refazer o setup do Twilio Voice para apontar a TwiML App e o DID para `telephony-webhook/voice`.
5. Executar o roteiro real com número individual, número corporativo, DND, offline, ocupado, fora do horário, saída automática/manual, gravação e fallback.

## Observação por 48 horas

Monitorar chamadas sem `phone_number_id`, callbacks com `invalid_signature`, attempts repetidos, tarefas com o mesmo `source_external_id`, gravações sem `call_id` e presença com heartbeat superior a 75 segundos.

Critérios para expandir:

- zero chamadas e gravações órfãs;
- uma tarefa por chamada perdida;
- nenhum usuário repetido nos attempts de uma chamada;
- toda saída vinculada a número autorizado;
- assinatura válida aceita e assinatura inválida respondida com `403`;
- associação consistente entre `calls`, `call_attempts` e `call_recordings`.

## Rollback

Remover a organização piloto de `feature_flags.telephony_v2.organization_ids` (ou desabilitar a flag). O schema e os dados V2 são preservados, mas frontend e roteamento voltam ao fluxo legado. Não remover tabelas ou colunas durante o piloto.
