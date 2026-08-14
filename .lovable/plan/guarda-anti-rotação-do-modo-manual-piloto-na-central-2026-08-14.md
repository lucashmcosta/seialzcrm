# Guarda anti-rotação do modo Manual + piloto na Central

## Princípio

No modo Manual, a escolha do operador é contrato. Se o endpoint escolhido ficar indisponível entre a validação e o envio, a mensagem NÃO pode sair pelo `active_endpoint_id` da Route. Comportamento correto: fail-closed com `409 MANUAL_REPLY_ENDPOINT_INACTIVE`, mensagem clara ao operador, e liberdade de escolher outro número ou voltar para Automático. Nenhum fallback silencioso.

## Etapa 1 — Guarda anti-rotação (código)

`supabase/functions/meta-whatsapp-send/index.ts` e `supabase/functions/evolution-whatsapp-send/index.ts`: antes do bloco de rotação por linha (`if (endpoint && endpoint.is_active === false)`) e antes do fallback purpose-aware (`if (!endpoint)`), inserir:

- se `manualReply.mode === "manual"` e o endpoint estiver ausente ou `is_active === false` → retornar `409` com `error: "MANUAL_REPLY_ENDPOINT_INACTIVE"` e mensagem "O número escolhido em 'Responder por' não está mais disponível. Escolha outro número ou volte para o modo Automático.";
- não consultar `messaging_lines`, não escolher outro endpoint, não enviar.

`supabase/functions/twilio-whatsapp-send/index.ts`: já é fail-closed no caminho `/messages` (endpoint inativo → 403 antes de qualquer envio); alinhar apenas o código/mensagem de erro para `MANUAL_REPLY_ENDPOINT_INACTIVE` quando a escolha for manual, sem mudar o fluxo.

O caminho Automático fica inalterado nos três providers. Sem mudanças em Route, flags, schema ou UI.

Verificação: bateria de testes existente + typecheck; deploy das três functions com a flag ainda OFF na Central.

## Etapa 2 — Piloto controlado na Central

1. Habilitar `sales_manual_reply_endpoint_v1` para a org da Central (`40ae935c-a7f7-4ad7-8ea4-91be6404a95f`), preservando a Viagi.
2. Conceder endpoints aos usuários piloto via RPC `grant_user_reply_endpoint`: Meta 7067 (`bf04ce63…`) e Meta 7020 (`407ff93d…`).
3. Validar envio Manual → 7067.
4. Validar envio Manual → 7020.
5. Validar retorno para Automático (preferência apagada, roteamento original restaurado).
6. Conferir em cada mensagem gravada: `metadata.reply_endpoint_choice`, `manual_reply_endpoint_id`, `chosen_by_user_id`.

Os passos 3-5 dependem de envio real pelo operador; entrego o relatório de verificação do banco após cada envio.

## Fora de escopo (pós-piloto)

- Tela administrativa de grant/revoke de endpoints por usuário.
- Ajustes de UX do seletor e demais refinamentos.
