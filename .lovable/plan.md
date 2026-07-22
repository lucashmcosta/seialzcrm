
# Plano — Voltar ao roteamento por `business_context + purpose + messaging_lines`

Objetivo: reestabelecer o comportamento antigo em que **a thread é o histórico do contato** e o **envio é resolvido dinamicamente pela linha ativa do purpose**, sem exigir migração manual entre providers (Twilio ↔ Meta ↔ Evolution) e sem perder histórico.

## Princípios (não negociáveis)

1. `message_threads.primary_endpoint_id` = **origem histórica**. Nunca é reescrito por troca de provider.
2. Endpoint efetivo de envio é resolvido em runtime por:
   `thread.business_context` → `purpose` (sales→commercial, support→customer_service) → `messaging_lines.active_endpoint_id` da org.
3. Histórico permanece contínuo por contato; a troca de número aparece como marcador visual, não como thread nova.
4. UI (composer, seletor de template, gate de janela 24h) usa **o mesmo endpoint que o dispatcher usaria**. Uma única fonte de verdade.

## Mudanças

### 1. `supabase/functions/_shared/dispatch-whatsapp-send.ts` e `src/lib/dispatchWhatsAppSend.ts`
- Remover a “regra dura” que força `primary_endpoint_id` em replies.
- Nova ordem de resolução:
  1. `endpointId` explícito do caller (ex.: envio via botão de rotação manual) → respeita.
  2. Caso contrário: resolver por `messaging_lines.active_endpoint_id` da linha correspondente a `business_context` da thread.
  3. Fallback: `primary_endpoint_id` **apenas se** estiver `is_active=true` e pertencer ao mesmo `purpose`.
  4. Sem endpoint ativo na linha → **bloquear com mensagem clara** (“Linha Comercial sem número ativo”), não cair em provider default.
- Remover o bloco de “re-rota lazy Comercial → Meta 7020” hardcoded por `organizationId`. Substituído pela resolução por linha.

### 2. `src/hooks/useThreadSendEndpoint.ts`
- Simplificar: sempre resolver pela linha ativa do purpose da thread, independentemente do estado do primary. O primary só é usado como *tie-breaker* quando ainda está ativo e é o próprio endpoint da linha.
- Retornar `provider`, `purpose`, `organizationIntegrationId` já com base na linha.

### 3. `src/pages/messages/MessagesList.tsx`
- Remover a lógica atual de “Enviar pelo 8439 e migrar conversa” como fluxo especial. O composer passa a usar automaticamente o endpoint retornado por `useThreadSendEndpoint`.
- Remover overrides manuais de `composerEndpointId` / `bypassWindow` introduzidos no fluxo Evolution.
- Gate de janela 24h passa a ser calculado sobre o endpoint efetivo (não sobre o primary). Se a linha ativa é Evolution, sem janela; se é Meta/Twilio, aplica janela normalmente.
- Manter apenas um botão discreto **“Trocar número desta linha”** (admin/operacional) que altera `messaging_lines.active_endpoint_id`, não a thread.

### 4. `thread-migrate-endpoint-send` (edge)
- Deprecar. Substituído por: alterar `messaging_lines.active_endpoint_id` → todas as threads daquela linha passam a enviar pelo novo número automaticamente, sem tocar em `primary_endpoint_id`.
- Nenhuma nota interna redundante; o evento visual de “número alterado” vem do marcador (ver item 6).

### 5. Backfill mínimo (sem migration nova)
- Garantir que `messaging_lines` da org piloto (Viagi e Central Trabalhista) tenha `active_endpoint_id` apontando para o endpoint correto de cada linha (Comercial=Evolution 8439 onde aplicável; Atendimento conforme já configurado).
- Garantir `business_context` correto nas threads recém-criadas por Evolution (script já existe; validar).

### 6. Marcador visual de rotação (UI, opcional nesta fase)
- Já suportado pelo `messages.endpoint_id` diferente entre mensagens consecutivas. Renderizar divisor “📞 Número alterado: X → Y” quando `endpoint_id` muda. Sem alteração de dados.

## Verificação

1. Thread antiga Meta/Twilio da Viagi: enviar mensagem → dispatcher resolve Evolution 8439 pela linha Comercial → mensagem sai, histórico continua na mesma thread, sem migração de `primary_endpoint_id`.
2. Alterar `messaging_lines.active_endpoint_id` da linha Comercial para outro endpoint → próximo envio em qualquer thread comercial sai pelo novo número, sem intervenção na thread.
3. Thread de Atendimento nunca resolve para endpoint Comercial (isolamento por purpose).
4. Se `active_endpoint_id` for null → envio bloqueia com mensagem clara, sem cair em provider default.
5. `useThreadSendEndpoint` e o dispatcher retornam o **mesmo** endpoint para a mesma thread (composer, seletor de templates e envio consistentes).
6. F5 na thread após envio: continua visível na lista, `business_context` intacto, `primary_endpoint_id` inalterado.

## Fora de escopo

- Múltiplas linhas por tela (diluição de risco de ban) — fica para depois.
- Nova UI de painel de rotação — apenas o botão discreto do item 3.
- Qualquer mudança em Inbox (linha Atendimento continua como está).
