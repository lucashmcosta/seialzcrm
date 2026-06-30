
# Remover bloco "Templates aprovados" do modal Meta Cloud API

A funcionalidade já existe na tela dedicada de Templates WhatsApp, então o card no modal de integração vira ruído.

## Mudança

Arquivo: `src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx`

1. Remover o bloco JSX `{/* ===== Templates ===== */}` (linhas ~276–337) — o `<Card>` inteiro com "Templates aprovados", botão "Sincronizar templates", lista e contador.
2. Remover o `templatesQuery` (linhas ~139–153) e o `syncTemplatesMutation` (linhas ~155–165), agora sem uso.
3. Limpar imports que ficarem órfãos: `ArrowsClockwise`, `Badge`, `Separator`, `useMutation`, e o `metaWhatsAppService` se nenhuma outra chamada permanecer (verificar antes).

Nenhuma outra seção é alterada. Regras de Entrada, Endpoints adicionais e a função `meta-whatsapp-templates-sync` permanecem intactas (continua sendo usada pela tela de Templates).
