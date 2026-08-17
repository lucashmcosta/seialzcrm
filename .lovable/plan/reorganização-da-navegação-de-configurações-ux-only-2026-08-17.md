# Reorganização da navegação de Configurações (UX only)

Objetivo: dar ao WhatsApp Comercial um ponto de entrada próprio em Configurações, mantendo 100% das telas, integrações e regras atuais.

## O que muda

1. **Novo card "WhatsApp Comercial"** na página de Configurações, primeiro item da seção — que passa a se chamar **Comunicação** (antes "Integrações & Canais").
   - Título: WhatsApp Comercial
   - Descrição: "Gerencie números, roteamento e provedores do WhatsApp Comercial."
   - Ícone: WhatsappLogo (mesmo usado hoje)
   - Mesma permissão do card Integrações (`canManageIntegrations`)

2. **Novo ponto de entrada** `/settings/whatsapp-comercial`, que renderiza exatamente o componente já existente `SalesWhatsAppSettingsSection` (nenhuma reimplementação, nenhuma cópia de lógica).

3. **Integrações continua igual**, com todas as integrações (Meta, Evolution, Twilio, OpenAI, Claude, Gemini, ElevenLabs, Kommo, SuvSign, Nammux, etc.). Para evitar duas superfícies do mesmo módulo, o bloco "WhatsApp Comercial" hoje embutido na tela de Integrações passa a ser um **atalho discreto** ("Abrir WhatsApp Comercial") apontando para a nova rota — mesmo texto de contexto, sem duplicar a implementação.

4. **Ordem final da seção Comunicação**: WhatsApp Comercial · Integrações · WhatsApp Templates · Respostas Rápidas · Atendimento · Webchat · API & Webhooks · Agente IA · Intelligence · Provedores de IA (todos os cards atuais preservados).

## Detalhes técnicos

- `src/components/settings/SettingsGrid.tsx`: renomear título/descrição do grupo, inserir o item `whatsapp-comercial` (isso já alimenta busca e breadcrumb via `getSettingsLabelByPath`).
- `src/App.tsx`: nova rota filha `whatsapp-comercial` dentro de `/settings`, com `lazyWithRetry` apontando para uma página fina nova (`src/pages/settings/SalesWhatsAppPage.tsx`) que apenas monta `SalesWhatsAppSettingsSection` com o mesmo cabeçalho textual atual. Rotas existentes ficam intactas.
- `src/components/settings/IntegrationsSettings.tsx`: trocar o `<SalesWhatsAppSettingsSection />` inline por um cartão-atalho `Link` para a nova rota; a aba/categoria "whatsapp" permanece.
- Nada de backend, SQL, Edge Functions, hooks, queries, permissões ou regras de roteamento é tocado.

## Validação

- Todos os cards e integrações continuam acessíveis; nada removido.
- `/settings/whatsapp-comercial` mostra a tela atual do módulo (números, provedores, roteamento) funcionando igual.
- Acesso antigo via Integrações continua levando ao mesmo módulo (atalho).
- Typecheck limpo e build sem erros.
