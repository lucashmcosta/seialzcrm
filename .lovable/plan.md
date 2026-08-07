# Diagnóstico read-only — Evolution API self-service (estado ATUAL)

Nada foi alterado: nem código, nem banco, nem servidor Evolution.

## Matriz

| ETAPA | AUTOMÁTICA HOJE? | ARQUIVO/FUNÇÃO RESPONSÁVEL | LIMITAÇÃO |
|---|---|---|---|
| 1. Botão "adicionar/conectar novo número" no tenant | NÃO | `src/components/integrations/evolution-whatsapp/EvolutionWhatsAppDialog.tsx` | O dialog só lista instâncias já existentes em `evolution_instances` filtradas pela org. Sem nenhuma instância, mostra o alerta "Sua instância ainda não está provisionada — fale com o suporte Seialz". Não há ação de criar. |
| 2. Criar nova instância na Evolution | PARCIAL (só admin) | `src/pages/admin/AdminEvolution.tsx` (`CreateInstanceCard`) → `evolution-instance-manager` `op=create` | Existe apenas em `/admin/evolution` (superfície interna Seialz). O próprio card diz que o vínculo com `communication_endpoints`/`evolution_instances` é feito manualmente. |
| 3. Mostrar QR Code | SIM | `op=connect` (manager) + `useConnectInstance` — QR renderizado nos dois lados (admin e tenant) | Só funciona se a instância já existir em `evolution_instances` (o `op=create` do admin devolve QR no momento da criação, mas sem persistência). |
| 4. Usuário escanear QR | SIM | fluxo WhatsApp | — |
| 5. Detectar `state=open` | SIM | `evolution-webhook` (`CONNECTION_UPDATE`) + `evolution-health-check` (cron 5 min) + `op=connectionState` | Só atualiza se `evolution_instances.instance_name` existir; `resolveInstance()` retorna null e o evento é descartado para instâncias não registradas. |
| 6. Criar/persistir `communication_endpoints` automaticamente | NÃO | — | Nenhum caminho de código insere endpoint Evolution. `evolution-instance-manager` declara explicitamente (cabeçalho, linhas 11-13): "NÃO cria communication_endpoints, messaging_lines nem evolution_instances automaticamente". O único endpoint Evolution existente tem id `1111...0001`, criado por SQL. |
| 7. Associar `organization_id` | NÃO | — | Consequência de 6. O manager sequer recebe org na criação: resolve org a partir de `evolution_instances` (que ainda não existe) ou de `body.organizationId` — e usa isso só para checar a feature flag. |
| 8. Gravar `provider='evolution_api'` | NÃO | — | Idem 6 — feito manualmente/SQL. |
| 9. Gravar `purpose` correto | NÃO | — | Não há UI para definir `purpose` de endpoint (nem Evolution, nem Meta/Twilio). O valor atual (`commercial`) foi corrigido por SQL em incidente anterior. |
| 10. `requires_template_outside_window=false` | NÃO | coluna consumida em `src/pages/messages/MessagesList.tsx` / `useThreadSendEndpoint.ts` | A coluna existe e é lida corretamente pelo composer, mas o default é `true` e nenhuma UI a expõe. O `false` do 8439 foi setado por SQL. |
| 11. Criar/associar `messaging_line` | NÃO | leitura em `useThreadSendEndpoint.ts`, `dispatchWhatsAppSend.ts`, send functions | Nenhum arquivo em `src/` ou `supabase/functions/` faz INSERT/UPDATE em `messaging_lines` — só SELECT. As 5 linhas existentes foram criadas por migration/SQL. |
| 12. Definir `active_endpoint_id` quando solicitado | NÃO | — | Sem UI e sem função de escrita. Rotação de linha hoje = UPDATE manual. |
| 13. Configurar webhook da nova instância | SEMI-AUTOMÁTICO | `op=webhookSet` (manager) — URL + secret montados no servidor | A URL/secret são seguros e server-side, mas o disparo é manual: botão "Atualizar webhook" no dialog do tenant e em `/admin/evolution`. `op=create` não chama `webhookSet`. |
| 14. Persistir `evolution_instances` (name/id_remote/endpoint_id) | NÃO (só UPDATE) | `op=create` faz UPDATE de `instance_id_remote` **se** a linha já existir | Nenhum INSERT em `evolution_instances` em todo o repositório. `endpoint_id` é NOT NULL e depende do endpoint da etapa 6. |
| 15. Inbound + outbound funcionando sem SQL | NÃO | `evolution-webhook` (inbound), `evolution-whatsapp-send` + dispatcher (outbound) | Runtime funciona bem **depois** que endpoint + instância + linha existem. Antes disso, inbound é descartado (`resolveInstance` null) e outbound não resolve endpoint. |
| Gate de feature flag | ATIVO | `evolution_api_enabled` (`_shared/feature-flags.ts`), checado em toda op do manager | Flag global OFF; opera por allowlist `organization_ids`. Nova org só funciona após inclusão manual na flag. |

## Conclusão

**C) NÃO — a UI atual serve apenas para administrar/reconectar instâncias já provisionadas.**

O dialog do tenant é puramente operacional (QR, estado, webhook, desconectar, health check) e, sem uma linha em `evolution_instances`, apenas instrui a falar com o suporte. O `/admin/evolution` cria a instância no servidor Evolution, mas o provisionamento no Seialz (endpoint, purpose, capability, linha, registro da instância) permanece 100% manual via SQL — o que é coerente com o único caso em produção (`dev-int` / `+5511936198439`, endpoint e linha com IDs sintéticos criados por migration).

## Mínimo que falta para virar self-service completo

1. Uma operação transacional de provisionamento (hoje inexistente) que, ao criar a instância, insira `communication_endpoints` (org, `provider='evolution_api'`, `channel='whatsapp'`, `purpose` escolhido, `requires_template_outside_window=false`, `is_active`) e a linha correspondente em `evolution_instances` com `instance_name`/`instance_id_remote`/`endpoint_id`.
2. Chamada automática de `webhookSet` imediatamente após o create (hoje é um clique separado).
3. Preenchimento automático do `external_address` quando a conexão abre — o número real só é conhecido no `CONNECTION_UPDATE`/`fetch` (`ownerJid`), e nenhum código escreve isso no endpoint hoje (foi corrigido por script pontual no piloto).
4. `upsert` de `messaging_lines` por `purpose` + capacidade de definir `active_endpoint_id` a partir da UI (opt-in "usar este número para enviar").
5. Superfície no tenant: botão "Adicionar número" no `EvolutionWhatsAppDialog` com seleção de finalidade (Comercial/Atendimento), substituindo o alerta "fale com o suporte".
6. Auto-habilitação (ou remoção) do gate `evolution_api_enabled` por org, já que hoje a allowlist é editada manualmente.
