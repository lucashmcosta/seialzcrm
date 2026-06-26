Vou ajustar o fluxo da integração Meta WhatsApp Cloud para que clicar em **Validar e salvar** nunca derrube a tela nem mostre erro genérico do Lovable.

Plano:
1. **Tratar erro da Meta no frontend**
   - Detectar `meta_validation_failed` no serviço `metaWhatsAppService`.
   - Transformar a resposta 400 em uma mensagem amigável em PT-BR, sem disparar runtime error genérico.

2. **Melhorar a ação do botão**
   - Manter **Validar e salvar** como validação real na Meta.
   - Se a Meta recusar o Phone Number ID/token, mostrar toast/alerta claro dizendo que a validação falhou e orientar usar **Salvar sem validar**.

3. **Evitar “app encountered an error”**
   - Garantir que erros esperados de edge function sejam capturados no componente, não vazem como exceção não tratada.
   - Preservar o modal aberto para você poder clicar em **Salvar sem validar** logo depois.

4. **Opcional no mesmo ajuste**
   - Renomear os botões para ficar mais óbvio:
     - Primário: **Salvar sem validar**
     - Secundário: **Validar na Meta**
   - Assim o fluxo padrão para trocar número/ID não depende da Meta aceitar a consulta.

Arquivos envolvidos:
- `src/services/metaWhatsAppService.ts`
- `src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx`

Nenhuma alteração de banco é necessária.