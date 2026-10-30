# Categoria Autenticação (OTP) em templates Meta Cloud

Mudança aditiva. Utilidade e Marketing seguem exatamente o caminho atual.

## Verificação do banco (feita, só leitura)
- `category`: CHECK já aceita `AUTHENTICATION` e `authentication`. Nada a fazer.
- `template_type`: CHECK aceita só `text, media, quick-reply, list-picker, call-to-action, interactive`. **`authentication` NÃO é aceito hoje.**

Migration proposta (somente adiciona um valor; mantém todos os existentes). Não será aplicada sem sua aprovação deste plano:

```sql
BEGIN;
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT whatsapp_templates_template_type_check;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_template_type_check
  CHECK (template_type = ANY (ARRAY['text','media','quick-reply','list-picker','call-to-action','interactive','authentication']));
COMMIT;
```
Rollback: recriar a constraint com a lista original (sem `authentication`), após confirmar que nenhuma linha usa esse valor.

Alternativa sem migration: gravar `template_type = 'text'` e identificar OTP pela categoria + componentes. Se preferir essa, diga e sigo sem migration.

## Tela
Quando Categoria = "Autenticação" (provedor Meta):
- Tipo de Template mostra só "Código de verificação (OTP)".
- Sem corpo, cabeçalho, variáveis, botões/ações, mídia.
- Campos: "Adicionar aviso de segurança" (marcado), "Validade do código (minutos)" (1–90, padrão 5), "Texto do botão" (padrão "Copiar código", até 25).
- Prévia: "*123456* é seu código de verificação. Para sua segurança, não o compartilhe." / "Este código expira em N minutos." / botão.
- Erros da Meta (incluindo permissão) exibidos na tela.

## Servidor (meta-whatsapp-templates-create)
- Ramo `if (category === 'AUTHENTICATION')` isolado no início, com retorno próprio; código existente não é refatorado nem reformatado.
- No ramo: valida entrada (minutos 1–90, texto 1–25, aviso booleano) e monta a linha local completa ANTES de chamar a Meta; depois POST com exatamente BODY/FOOTER/BUTTONS(OTP, COPY_CODE); grava na mesma tabela com category AUTHENTICATION e os componentes.
- `buildComponents` existente extraído só por export (sem alterar corpo) para teste.

## Testes
- Teste Deno: para UTILITY e MARKETING, payload gerado é idêntico ao snapshot do comportamento atual (header, body com variáveis, footer, quick replies).
- Teste Deno: payload AUTHENTICATION exatamente como especificado; validações recusam valores fora do limite.

## Restrições respeitadas
- Componentes compartilhados (TemplateTypeSelector, WhatsAppPreview, hook de criação): só props novas e opcionais.
- Nada em envio, sincronização de status, webhooks, dispatchers, Twilio ou Evolution.
- Nenhum template de teste criado na Meta; permissão do token só se confirma na sua primeira criação (erro aparece na tela).

## Entrega
Lista de arquivos, diff da função, resultado dos testes e status da migration.
