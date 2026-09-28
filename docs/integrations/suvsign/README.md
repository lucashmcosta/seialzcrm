# SuvSign (assinatura eletrônica)

**Referência técnica:** `docs/audit/04-integracoes/suvsign.md`.

## Finalidade
Geração e assinatura eletrônica de contratos vinculados a oportunidades.

## Webhook
- `suvsign-webhook` — recebe callback de assinatura.
- Valida HMAC e restringe `file_url` a hosts permitidos.
- Deduplica callbacks pelo identificador estável do documento no provedor.
- Contratos ligados a oportunidades já ganhas entram no outbox do Nammux pelo
  fluxo descrito na [ADR-0010](../../decisions/0010-post-win-document-sync.md).

## Tabelas
`documents`, `document_types`.

## Envio do link V2 pelo WhatsApp

No modal de assinatura, cada participante manual pendente oferece **Enviar pelo WhatsApp**, ao lado de **Copiar link**. O operador confere contato, número e prévia antes de enviar. Assinados, automáticos e solicitações encerradas não oferecem essa ação.

Um administrador configura, nesse modal, o template e a URL HTTPS pública da imagem do cabeçalho por conta WhatsApp (`organization_integration_id`). Nesta versão, o envio usa números Meta Cloud elegíveis no Comercial. O modelo deve estar aprovado, ativo, classificado para a finalidade do número e conter um único botão URL `https://sign.suvsign.com/s/{{1}}`, sem outras variáveis obrigatórias. O nome do template e o número não são fixados no código.

O backend obtém o link V2 individual somente no envio e preenche o sufixo do botão. A imagem é um parâmetro de cabeçalho do template, não uma prévia de link. O envio segue o dispatcher existente, incluindo as regras do provider. A conversa e a mensagem são registradas pelo fluxo normal.

- `signature_whatsapp_settings`: configuração por organização/conta.
- `signature_whatsapp_deliveries`: tentativas, idempotência e referências de mensagem/conversa, sem token de assinatura.
- Ambas as tabelas têm RLS e acesso somente pelo backend. A solicitação e o contato são lidos com as permissões reais do usuário; organização, conta, número e destinatário são revalidados no envio.
- O contato precisa corresponder ao telefone do snapshot do participante; quando o snapshot não possui telefone, usa-se e-mail exato. Corrija o cadastro se não houver contato compatível.
- Cliques simultâneos são bloqueados; um reenvio exige confirmação. Em timeout, **Atualizar status** consulta a mensagem correlacionada. Sem evidência terminal, a tentativa permanece bloqueada para não duplicar o envio; requer conferência operacional.
- O token não fica na configuração, auditoria, logs do payload nem nos componentes persistidos da mensagem. É transmitido à Meta apenas como parâmetro do botão.

### Validação

```sh
deno test --allow-env --allow-read supabase/functions/_shared/meta-template-components.test.ts supabase/functions/_shared/signature-whatsapp.test.ts supabase/functions/_shared/suvsign-v2.test.ts
deno check supabase/functions/signature-requests/index.ts supabase/functions/meta-whatsapp-send/index.ts
node scripts/test-signature-whatsapp-ui.mjs
```

O teste de navegador exige Playwright instalado (ou `PLAYWRIGHT_MODULE` apontando para seu módulo) e Chromium. `PLAYWRIGHT_EXECUTABLE_PATH` permite usar um executável existente. O script inicia Vite em 127.0.0.1:5182, cria/remove um harness temporário e simula as APIs: não envia mensagens reais. Testa desktop/celular, configuração, prévia, duplo clique, confirmação de reenvio e bloqueios. Isso não comprova entrega real pela Meta.

Publicação: aplicar a migração `20260928210000_signature_whatsapp.sql`, publicar `meta-whatsapp-send` e `signature-requests`, depois o frontend. Configurar o template/imagem da conta pelo modal. Não há alteração de atribuição comercial ou marketing.

## Dívida
- Sem instrumentação Sentry (dívida crítica).
