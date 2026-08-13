# Fase 3 — WhatsApp Comercial como Manager completo da Evolution

Objetivo: o operador administra números, QR Code, instâncias, Route e status inteiramente pelo CRM, em **Configurações > Integrações > WhatsApp Comercial**, sem abrir Evolution Manager, Supabase ou SQL.

## Descoberta (estado real hoje)

Já existe (será reutilizado, não duplicado):
- `evolution-instance-manager` (Edge Function) com `create`, `connect`, `logout`, `delete`, `connectionState`, `webhookFind`, `webhookSet`. Exige JWT e a flag `evolution_api_enabled`.
- `evolution-health-check` (estado real periódico), `evolution-webhook`, `evolution-whatsapp-send`.
- Cliente/provider Evolution em `_shared/evolution/*`, tabela `evolution_instances`.
- Tela admin de plataforma `src/pages/admin/AdminEvolution.tsx` (visão Seialz).
- Tela do tenant `SalesWhatsAppSettingsSection.tsx`: hoje somente leitura (Route, número ativo, endpoints).
- Resolver V2 (`conv_route_resolver_v2`) ligado apenas para a Viagi — **não será tocado**.

Lacunas que a Fase 3 precisa cobrir:
1. Não existe operação **restart** na Edge Function.
2. Não existe **provisionamento** transacional: criar `communication_endpoints` + vincular em `messaging_line_endpoints` + definir `active_endpoint_id` a partir da UI.
3. Não existe operação de **troca de número ativo** da Route pela UI.
4. Não existe **teste de envio** disparado da tela nem **diagnóstico** consolidado.
5. A flag `evolution_api_enabled` precisa estar ligada para a org — hoje bloqueia tudo com 403.

## O que será construído

### Backend (aditivo, sem tocar resolver/Atendimento/Mobile)
- `evolution-instance-manager`: adicionar `restart` e `serverInfo` (para teste de conexão: versão/latência), mantendo JWT + flag + rate limit + validação de nome.
- Nova função `sales-route-admin` (nome interno) com operações **transacionais** e validadas por organização:
  - `provisionEndpoint`: cria/atualiza `communication_endpoints` (provider evolution/meta/twilio), registra `evolution_instances`, vincula em `messaging_line_endpoints`.
  - `setActiveEndpoint`: atualiza `messaging_lines.active_endpoint_id` (não cria Route, não altera histórico).
  - `diagnose`: relatório dos 12 checks (Route, active_endpoint, endpoint ativo/conectado, vínculo, resolver, flag, webhook, última inbound/outbound, provider).
  - `testSend`: usa exatamente o pipeline Comercial existente (mesmo dispatcher/resolver), retornando aceito/enviado/erro.
  - Guardas de segurança: bloquear exclusão do endpoint ativo sem confirmação, bloquear remover última Route, bloquear excluir instância em uso.
- Migração mínima: apenas se faltar coluna para motivo/autor da troca de número (histórico). Se `messaging_line_rotations` já cobrir, **nenhuma migração**.

### Frontend — a tela em 5 blocos
1. **Status Geral**: Route, linha, número ativo, provider, inbox, resolver, status da integração.
2. **Instâncias**: tabela (nome, número, provider, status real, Route, ativo, ações) + botão **Novo número**.
3. **Wizard Novo número**: Etapa 1 provider (Evolution/Meta/Twilio) → Etapa 2 nome interno, número, linha, Route → Etapa 3 criar instância (Evolution: `create` automático, persistência automática).
4. **QR Code**: modal grande e centralizado, com Atualizar QR, Copiar token, Cancelar; fecha sozinho ao conectar e mostra “WhatsApp conectado”.
5. **Operações e saúde**: Reconectar, Restart, Disconnect (com confirmação), troca de número ativo por rádio + “Tornar ativo”, histórico de números com data/autor/motivo, Testar conexão, Enviar mensagem teste, Health Check e Diagnóstico, além dos cards de dashboard (instâncias, conectadas, desconectadas, QR pendentes, mensagens hoje, templates, latência).

Estados de conexão vindos de `evolution_instances` + consulta ao servidor Evolution (nunca só `communication_endpoints.status`): Conectado / Conectando / QR expirado / Desconectado / Desconhecido, com refresh automático.

UX: componentes shadcn, linguagem de negócio, sem UUID/JSON/termos internos, responsivo.

## Restrições respeitadas
Sem alterar Atendimento, Mobile, resolver V2, triggers de canonicidade ou a flag `conv_route_resolver_v2`. Meta Cloud e Twilio continuam suportados. Nenhuma tela duplicada: a tela admin de plataforma continua para a Seialz; a nova experiência é a do tenant.

## Entrega e QA
Ao final: lista de arquivos alterados, APIs Evolution integradas, checklist QA (build, typecheck, console, responsividade, estados) e o que exigir validação no preview autenticado — o sandbox não tem sessão (Supabase externo), então operações reais de QR/conexão precisam de um clique seu.

## Ponto de decisão
Para qualquer operação funcionar, a flag `evolution_api_enabled` precisa estar ligada para a organização (hoje retorna 403). A implementação será entregue completa e eu **paro antes de ligar a flag**, pedindo sua autorização — igual ao padrão da Fase 2.
