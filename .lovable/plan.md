# Auditoria final (somente leitura): "Fora da janela 24h" em conversa Evolution

## Caso real consultado
Conversa Denise Barreto, Central Trabalhista (org `40ae935c…`), thread `ec86ff7b-eba7-406f-9e33-c34c6709e589`, `business_context = sales`, último inbound em 16/09 (fora das 24h).

| Item | Valor |
|---|---|
| `thread.primary_endpoint_id` | `3ed219e0-b919-4a1f-b2f6-6806cfafe6f7` (Evolution 7020) |
| Endpoint da última mensagem | `3ed219e0…` (Evolution) |
| Linha Comercial `messaging_lines.active_endpoint_id` | `bf04ce63-d310-4c16-a133-b373a40df340` (Meta 7067) |

Endpoint Evolution `3ed219e0…`: provider `evolution_api`, is_active `true`, purpose `commercial`, **requires_template_outside_window `true`**, criado em 14/08/2026, **não** é o `active_endpoint_id` de nenhuma linha.

Endpoint ativo da linha `bf04ce63…`: provider `meta_cloud_api`, is_active `true`, purpose `commercial`, requires_template_outside_window `true` (correto para Meta).

**O que `useThreadSendEndpoint` escolhe:** primary tem purpose `commercial` → linha `commercial` → `active_endpoint_id = bf04ce63` (Meta, ativo) → retorna Meta, `isRotated = true`, `requiresTemplateOutsideWindow = true`. O primary Evolution só seria usado se a linha não tivesse endpoint ativo.

## Conclusão
Duas causas ao mesmo tempo:

1. **O app escolhe outro endpoint (causa principal).** O cabeçalho e o "Responder por" mostram Evolution 7020, porque é o número da última mensagem. Mas o bloqueio do campo usa o número ativo da linha Comercial, que é o Meta 7067. Enquanto o bloqueio olhar para o Meta, ele vai continuar, mesmo com a flag certa no Evolution.
2. **O endpoint Evolution está com `true`, não `null`.** A coluna é NOT NULL com padrão `true`. O preenchimento de julho corrigiu só os endpoints Evolution que já existiam. Os dois criados depois ficaram com `true`: `3ed219e0…` (Central) e `43cca41d…` (org `689f30e5…`, 22/09). Só o piloto `11111111-e701…` está com `false`.

A hipótese 4 (a flag se perde entre o banco, o hook e o Composer) foi descartada, porque o hook lê a coluna direto e só a afrouxa quando o valor é exatamente `false`.

## Origem do problema no cadastro
Três rotinas do banco criam endpoints, e nenhuma grava `requires_template_outside_window` (confirmado em produção):
- `provision_line_endpoint_core`: é por onde a Evolution é provisionada (o INSERT lista as colunas sem a flag, então vale o padrão `true`).
- `provision_sales_endpoint`
- `populate_communication_endpoints_from_v2_senders` (Twilio, onde `true` já é o valor certo)

As funções de backend da Evolution não criam endpoints.

## Correção proposta
1. **Cadastro:** a capacidade passa a ser gravada pela própria rotina de criação, com base no provedor já escolhido (`v_canonical`), em `provision_line_endpoint_core` e `provision_sales_endpoint`: `evolution_api` fica `false` e os outros ficam `true`. A decisão fica num único lugar do banco, que espelha o `CAPABILITIES` de `_shared/whatsapp-provider/capabilities.ts`. O padrão `true` da coluna continua valendo, então tudo que for desconhecido segue bloqueado.
2. **Dados:** corrigir só `3ed219e0…` e `43cca41d…` para `false`, com o antes e depois registrado.
3. **Endpoint que o app avalia:** fazer o `useThreadSendEndpoint` usar a mesma regra do envio de verdade ("Responder por": o número escolhido ou o da última mensagem válida, conforme `replyEndpointSelection` / `dispatchWhatsAppSend`), em vez de ir sempre ao número ativo da linha. Antes de mudar, confirmo qual número o envio realmente usa nesta conversa. Se o envio também sai pelo Meta, o bloqueio está certo e o que está errado é o cabeçalho. Nenhum `provider === 'evolution_api'` no app. Sem número resolvido, o campo continua bloqueado.
4. **Documentação:** fechar o [TODO] em `docs/integrations/evolution-api/ENDPOINT_PURPOSE_RULE.md` e registrar no plano de linhas.

## Verificação
- Refazer a consulta: os dois endpoints com `false`; um endpoint Evolution novo, provisionado em teste, nasce com `false`, e um Meta nasce com `true`.
- Na conversa da Denise, o campo fica liberado só se o envio sair de fato pelo Evolution. Numa conversa Meta fora das 24h, o campo continua pedindo template.
