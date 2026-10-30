# Templates AUTHENTICATION: ocultar no envio manual + sync preservar tipo

## Situação confirmada
- `codigo_acesso_app` (Central, id `5d2d74f4-e931-4e04-91b6-538467400da6`): category=AUTHENTICATION, template_type=`text`, status no banco=`approved`, ativo.
- Pontos de envio manual que listam templates:
  - `WhatsAppTemplateSelector.tsx` (seletor da conversa — Comercial, Atendimento, contato, mobile).
  - `SendTemplateModal.tsx` (modal de envio, via `useTemplates`).
  - Envio em massa/campanhas: não existe tela de envio em massa de templates no código.
- Fora do escopo (envio pelo sistema, não por atendente): configurações de assinatura WhatsApp e Meta Lead Ads; a página de gestão `/settings/whatsapp-templates` continua listando tudo.
- Sync (`meta-whatsapp-templates-sync`) grava `template_type: "text"` fixo em insert e update.

## Mudanças
1. Novo helper `src/lib/whatsappTemplateManualSend.ts`: `isManualSendableTemplate(t)` retorna false quando `category` (case-insensitive) = AUTHENTICATION. Aplicado como filtro adicional, sem mexer nos filtros existentes:
   - `WhatsAppTemplateSelector.tsx`: no `.filter` após a query (junto ao filtro de purpose).
   - `SendTemplateModal.tsx`: em `approvedTemplates`.
2. Novo `supabase/functions/meta-whatsapp-templates-sync/template_type.ts`: `resolveSyncedTemplateType(category)` → `'authentication'` se AUTHENTICATION, senão `'text'` (igual a hoje). `index.ts` usa no `row.template_type`. Publicar a função.
3. Correção do registro (após mostrar o UPDATE e um SELECT count = 1):
   ```sql
   UPDATE whatsapp_templates SET template_type='authentication'
   WHERE id='5d2d74f4-e931-4e04-91b6-538467400da6'
     AND organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
     AND friendly_name='codigo_acesso_app';
   ```
4. Testes:
   - Vitest `src/lib/whatsappTemplateManualSend.test.ts`: AUTHENTICATION/authentication ocultos; MARKETING, UTILITY e null visíveis.
   - Deno `template_type_test.ts`: AUTHENTICATION → authentication; MARKETING/UTILITY/undefined → text.
5. Status na Meta: consultar o status atual do `codigo_acesso_app` direto na Meta (somente leitura) e reportar APPROVED/PENDING/REJECTED.

## Entrega
Arquivos alterados, diff de cada um, resultado dos testes e status Meta. Alertas do banco não serão tratados. Nenhuma migration.
