# Smoke Test Final — WhatsApp Comercial (validação, sem features novas)

Nenhuma alteração de arquitetura, SQL, trigger, flag ou resolver. Apenas execução de verificações e correção de defeitos encontrados no smoke.

## Escopo da execução

### 1. Build e código (automatizável agora)
- Typecheck, build e lint do projeto.
- Testes Deno das edge functions (bateria atual, inclui as barreiras estáticas do resolver).
- Auditoria de código do lookup canônico nos três webhooks (Meta, Twilio, Evolution): confirmar contrato `org + contact + channel='whatsapp' + business_context='sales' + merged_into_thread_id IS NULL` e a recuperação de corrida.
- Auditoria de código do fluxo Evolution (Conectar WhatsApp, modal QR, estados humanos, bloqueio de "Tornar ativo" sem identidade confirmada) — sem celular real.

### 2. Banco (read-only)
Consultas de verificação, sem writes:
- duplicidades sales/whatsapp ativas (esperado 0);
- threads com `merged_into_thread_id IS NULL` recebendo o inbound de teste;
- ocorrências novas de `SALES_THREAD_DUPLICATE_BLOCKED` e de `no_thread_id_after_lookup_and_insert` após o horário do hotfix (esperado 0);
- eventos em `integration_inbound_events` com falha/descartados no período.

### 3. UI (navegação autenticada no preview)
- Comercial: abrir lista, abrir conversa, confirmar thread canônica única, banner "Sem inbound recente" coerente, cabeçalho/badge de número, modal "Detalhes da rota".
- Atendimento: abrir Inbox e uma conversa, confirmar EndpointBadge funcionando e nenhuma mudança visual.
- Console limpo em ambos os módulos.

### 4. Defeito já identificado no console (será corrigido)
O console do preview registra um warning de React na abertura do modal de detalhes da rota:
"Function components cannot be given refs" apontando para `Row` em `SalesRoutePanel.tsx`.
Correção mínima: transformar `Row` em componente com `React.forwardRef`, encaminhando o ref para o `div` externo. Nenhuma mudança de layout, texto ou dados.

## Itens que dependem de ação humana

Estes não podem ser fechados por mim e serão reportados como PENDENTE OPERACIONAL, não FAIL:
- envio de mensagem comum e recebimento de um inbound real no número Meta;
- resposta subsequente e confirmação do endpoint de saída (verificável no banco depois que você enviar);
- Twilio: sem inbound real disponível, entrega apenas auditoria de código PASS;
- Evolution: leitura do QR por celular.

## Entrega

Relatório em formato PASS / FAIL / PENDENTE OPERACIONAL por item, seguido de: bugs encontrados, bugs corrigidos e bloqueadores restantes. Qualquer FAIL de código é corrigido antes de encerrar.
