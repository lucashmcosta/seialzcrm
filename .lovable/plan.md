# Auditoria READ-ONLY — Tipo (purpose) e responsável dos números WhatsApp

Nada foi alterado. Resultado abaixo no formato solicitado.

## Entrega

```text
ENDPOINT_TABLE=public.communication_endpoints
PURPOSE_VALUES=commercial | customer_service | vendor_personal | other  (CHECK communication_endpoints_purpose_check; default 'other')
ASSIGNED_USER_FIELD=assigned_user_id (uuid, nullable) — existe
CURRENT_CREATE_FLOW=Configurações > Integrações > WhatsApp Comercial (SalesWhatsAppPage) → SalesWhatsAppSettingsSection ("Adicionar número") → EndpointDestinationStep (Comercial/Atendimento/Pessoal + Responsável) → hook useSalesRouteManager.provisionEndpoint → Edge sales-route-operations op=provisionEndpoint → RPC public.provision_line_endpoint(p_purpose, p_assigned_user_id, ...)
CURRENT_EDIT_FLOW=Inexistente para purpose/assigned_user_id. A única edição de endpoint hoje é AdditionalEndpointsSection (dentro de IntegrationDetailDialog): edita display_name e is_active via supabase.from('communication_endpoints').update(...), e EndpointInboundSettings (inbound_settings). Rotação de número ativo da rota: RPC rotate_messaging_line_endpoint.
CURRENT_SAVE_MUTATION=criação: provisionEndpoint (useSalesRouteManager) → provision_line_endpoint; edição existente: update direto em AdditionalEndpointsSection (apenas display_name/is_active)
CURRENT_UI_COMPONENT=src/components/settings/SalesWhatsAppSettingsSection.tsx (criação) + src/components/settings/EndpointDestinationStep.tsx (seletor de tipo/responsável, já pronto) + src/components/settings/AdditionalEndpointsSection.tsx (edição por integração)
PURPOSE_ALREADY_EXISTS=YES
ASSIGNED_USER_ALREADY_EXISTS=YES
BACKEND_ALREADY_SUPPORTS_THIS=YES (na criação: provision_line_endpoint valida compatibilidade purpose↔rota e exige assigned_user_id em vendor_personal; leitura: fn_can_user_use_reply_endpoint, fn_resolve_inbound_suggested_assignee, get_default_queue_for_thread; RLS UPDATE já permite org admin; nenhum trigger bloqueia alteração de purpose)
ONLY_FRONTEND_NEEDED=YES para expor os campos na edição de um número já existente (RLS de admin + colunas já existem). NÃO existe hoje validação server-side na troca de purpose por UPDATE direto (a validação vive só em provision_line_endpoint) — ver COMPATIBILITY_RISK.
FILES_THAT_WOULD_CHANGE=src/components/settings/SalesWhatsAppSettingsSection.tsx (adicionar ação "Tipo/Responsável" por linha, reutilizando EndpointDestinationStep) — opcionalmente src/components/settings/AdditionalEndpointsSection.tsx se o campo também deve aparecer na tela por integração
MINIMAL_UI_PLAN=Na lista de números de "WhatsApp Comercial", por linha: botão/inline "Tipo" abrindo EndpointDestinationStep (já existente, sem alterações) + Select de Responsável quando "Pessoal" + Salvar → update de { purpose, assigned_user_id } em communication_endpoints (assigned_user_id = null quando ≠ Pessoal) + invalidate do status da rota. Usuários vêm de useOrgActiveUsers (já existe). Sem nova RPC, sem nova edge function, sem SQL.
COMPATIBILITY_RISK=BAIXO-MÉDIO. (1) Um UPDATE direto de purpose não passa pelas validações de provision_line_endpoint (compatibilidade purpose↔inbox da rota: commercial/vendor_personal→sales, customer_service→customer_service); marcar como Pessoal um número que é o active_endpoint_id da rota Comercial deixaria a rota com endpoint não elegível (regra PERSONAL_NOT_ELIGIBLE já existe na UI de ativação). Mitigação puramente de frontend: bloquear a opção "Pessoal" para o número atualmente ativo da rota e não oferecer "Atendimento" para números vinculados à rota Comercial. (2) Estado atual: 24 endpoints WhatsApp, nenhum com assigned_user_id preenchido e nenhum vendor_personal — logo o impacto imediato é zero até alguém marcar o primeiro número pessoal.
```

## Observações de contexto (read-only)

- Usos de `purpose`: `src/lib/endpointPurpose.ts` (SALES_PURPOSES = commercial|vendor_personal, CS_PURPOSES), composer/roteamento (`composerEndpoint.ts`, `manualReplySelection.ts`, `salesReplyRoute.ts`, `dispatchWhatsAppSend.ts`, `useThreadSendEndpoint.ts`, `inboxScope.ts`), badges (`EndpointBadge.tsx`, `RouteIndicators.tsx`), manager (`useSalesRouteManager.ts`).
- Usos de `assigned_user_id` (endpoint): `fn_can_user_use_reply_endpoint` (autorização de resposta), `fn_resolve_inbound_suggested_assignee` (owner sugerido em contato novo), `get_default_queue_for_thread`, `sales-route-operations` (status/elegibilidade), `ManualReplySelector`/`MessagesList` (cadeado no composer).
- Não existe hoje campo de `purpose`/`assigned_user_id` na tela Configurações > Integrações > Evolution WhatsApp (`IntegrationDetailDialog` → `AdditionalEndpointsSection` só expõe nome e ativo). O ponto canônico para expor tipo/responsável é a tela WhatsApp Comercial (`SalesWhatsAppSettingsSection`), que já é provider-agnostic.

Nenhuma implementação nesta etapa — aprove para eu executar o diff mínimo descrito.
