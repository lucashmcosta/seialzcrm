

## Criar página Swagger/API Documentation da Seialz

### Visão geral

Criar uma página pública interativa de documentação de API no estilo Swagger UI, documentando todos os endpoints disponíveis: Lead Webhook (API pública com x-api-key), Edge Functions internas (auth via Bearer token), e WhatsApp Backend (Railway).

### Arquivos

**1. Criar `src/pages/docs/ApiDocs.tsx`**
Página completa estilo Swagger com:
- Header com logo Seialz + título "Seialz API Reference"
- Seções colapsáveis por grupo de endpoints
- Para cada endpoint: método (GET/POST/PUT/DELETE), path, descrição, parâmetros, request body, response examples
- Indicador de autenticação (x-api-key vs Bearer token)
- Botão "Copy" nos exemplos de curl
- Design dark com a paleta Seialz (verde #00FF88, fundo escuro)

**Grupos documentados:**

**A. Lead Webhook (API Pública)**
- `GET /functions/v1/lead-webhook` — Listar contatos, oportunidades, atividades (query: entity, limit, offset)
- `POST /functions/v1/lead-webhook` — Criar lead/contato (body: name, email, phone, company, etc.)
- Auth: `x-api-key` header
- Scopes: contacts:read, contacts:write, opportunities:read, activities:read

**B. WhatsApp Templates (Railway Backend)**
- `GET /api/whatsapp/templates` — Listar templates
- `GET /api/whatsapp/templates/:id` — Obter template
- `POST /api/whatsapp/templates` — Criar template
- `PUT /api/whatsapp/templates/:id` — Atualizar template
- `DELETE /api/whatsapp/templates/:id` — Deletar template
- `POST /api/whatsapp/templates/:id/approve` — Submeter para aprovação
- `POST /api/whatsapp/templates/sync` — Sincronizar com Twilio
- `POST /api/whatsapp/send` — Enviar mensagem com template

**C. Edge Functions (Internas — Bearer Auth)**
- `POST /functions/v1/ai-generate` — Gerar conteúdo com IA
- `POST /functions/v1/twilio-call` — Iniciar chamada
- `POST /functions/v1/twilio-whatsapp-send` — Enviar WhatsApp
- `POST /functions/v1/create-user` — Criar usuário
- `POST /functions/v1/export-conversations` — Exportar conversas
- E demais functions relevantes

**D. Webhooks Inbound**
- `POST /functions/v1/twilio-webhook` — Webhook Twilio Voice
- `POST /functions/v1/twilio-whatsapp-webhook` — Webhook Twilio WhatsApp
- `POST /functions/v1/suvsign-webhook` — Webhook SuvSign (assinatura)

Cada endpoint terá: método colorido (GET=verde, POST=azul, PUT=amarelo, DELETE=vermelho), path, descrição, tabela de parâmetros, exemplo de request/response JSON, e badges de auth.

**2. Atualizar `src/App.tsx`**
- Importar `ApiDocs` com lazy load
- Adicionar rota pública `/docs/api`

**3. Componentes internos da página:**
- `EndpointCard` — card colapsável para cada endpoint
- `MethodBadge` — badge colorido GET/POST/PUT/DELETE
- `ParamsTable` — tabela de parâmetros
- `CodeBlock` — bloco de código com botão copy
- `AuthBadge` — indica tipo de auth necessário

