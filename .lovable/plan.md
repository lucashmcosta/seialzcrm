
Objetivo: corrigir de vez o problema de “não aparecem etapas do pipeline” no WhatsApp Inbound Settings (não é problema de scroll).

Diagnóstico confirmado
- O frontend está consultando `public.pipelines`, mas essa tabela não existe.
- A requisição atual retorna 404 (`PGRST205`) com hint para `public.pipeline_stages`.
- Por isso o select de Pipeline fica vazio e as etapas nunca aparecem.
- Além disso, o webhook usa campos errados ao criar oportunidade (`pipeline_id` / `stage_id`), enquanto a tabela `opportunities` usa `pipeline_stage_id`.

Plano de implementação

1) Corrigir fonte de dados no frontend (`src/components/settings/WhatsAppInboundSettings.tsx`)
- Trocar query de `pipelines` por query direta em `pipeline_stages` filtrando por `organization_id` e ordenando por `order_index`.
- Simplificar UI:
  - remover dependência de “Pipeline” (já que no banco só existe estágios),
  - exibir diretamente “Etapa inicial do pipeline” quando `auto_create_opportunity` estiver ativo.
- Manter compatibilidade do JSON salvo:
  - continuar lendo `default_stage_id`,
  - manter `default_pipeline_id` apenas como legado (sem uso ativo), para não quebrar configs antigas.
- Adicionar tratamento visual para “nenhuma etapa cadastrada” (mensagem clara).

2) Corrigir criação automática no webhook (`supabase/functions/twilio-whatsapp-webhook/index.ts`)
- Substituir lógica de insert:
  - de `stage_id` para `pipeline_stage_id`.
- Resolver stage corretamente:
  - se `default_stage_id` vier nas configurações, usar ele (validando que pertence à organização),
  - senão buscar a primeira etapa da organização por `order_index`.
- Se não existir nenhuma etapa, logar erro claro e não tentar insert inválido.

3) Garantir consistência ponta a ponta
- Front salva `default_stage_id`.
- Webhook lê o mesmo campo e insere em `opportunities.pipeline_stage_id`.
- Resultado: usuário consegue selecionar etapa e a oportunidade cai na etapa correta.

Validação após implementar
- Abrir Configurações > Integrações > Twilio WhatsApp.
- Ativar “Criar oportunidade automaticamente”.
- Confirmar que “Etapa inicial do pipeline” lista etapas reais.
- Salvar, fechar e reabrir modal para verificar persistência.
- Teste inbound real/simulado: nova oportunidade criada na etapa escolhida.

Detalhe importante
- Não vou “desfazer” a mudança de scroll agora, porque ela não é a causa do bug de dados. O erro real é consulta na tabela errada + mapeamento errado no webhook.
