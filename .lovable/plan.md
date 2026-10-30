# Categoria Autenticação (OTP) em templates Meta Cloud

Mudança aditiva. Utilidade e Marketing seguem exatamente o caminho atual (mesmos campos, mesmo payload, mesma gravação).

## Tela (/whatsapp/templates/new?provider=meta_cloud_api)
Quando Categoria = "Autenticação" (só para provedor Meta):
- "Tipo de Template" mostra só "Código de verificação (OTP)".
- Some corpo, cabeçalho, variáveis, botões/ações e mídia.
- Novos campos: "Adicionar aviso de segurança" (marcado), "Validade do código (minutos)" (1–90, padrão 5), "Texto do botão" (padrão "Copiar código", até 25).
- Prévia: "*123456* é seu código de verificação. Para sua segurança, não o compartilhe." (sem a segunda frase se o aviso estiver desmarcado) / rodapé "Este código expira em N minutos." / botão com o texto escolhido.
- Voltar de Autenticação para outra categoria restaura o tipo "Texto".
- Erros da Meta (incluindo falta de permissão) aparecem na tela com a mensagem retornada.

## Servidor (função que cria o template na Meta)
- Se category = AUTHENTICATION: não exige body; monta exatamente
  BODY {add_security_recommendation}, FOOTER {code_expiration_minutes}, BUTTONS [{OTP, COPY_CODE, text}]; valida minutos 1–90 e texto ≤ 25 (422 se inválido).
- Não envia `allow_category_change` nesse caso (evita reclassificação).
- Grava na mesma tabela dos demais: category AUTHENTICATION, template_type "authentication", components acima, body com o texto aproximado da prévia; sincronização de status inalterada.
- Demais categorias: código atual intocado.

## Detalhes técnicos
- `src/pages/whatsapp/TemplateForm.tsx`: estado `authSecurity`, `authExpiry`, `authButtonText`; ramo `isAuth = isMetaProvider && category==='AUTHENTICATION'`; validação dos passos ignora corpo quando isAuth; envio passa `authentication: {...}`.
- Hook de criação Meta: repassar o campo `authentication` e exibir `message` do erro 422.
- `TemplateTypeSelector`/`WhatsAppPreview`: modo OTP opcional (sem afetar uso atual).
- `supabase/functions/meta-whatsapp-templates-create/index.ts`: ramo `buildAuthComponents`; deploy da função.
- Permissão do token: não dá para saber sem tentar; após implementar, faço uma criação de teste na Central só se você autorizar (cria um template real pendente na Meta). Sem autorização, informo que fica a confirmar no primeiro uso.
- Envio do template: fora de escopo.
