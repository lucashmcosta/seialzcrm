## Diagnóstico confirmado

Verifiquei no banco: as 2 organizações com `auto_send_whatsapp = true` têm `whatsapp_template_variables = {}` (vazio). O template tem `{{1}}` no corpo, mas o `meta-lead-ads-process-lead` envia `ContentVariables` vazio para o Twilio, então o WhatsApp renderiza `{{1}}` literal.

## Princípio: mudanças mínimas e aditivas

Toda a correção fica num **único bloco isolado** dentro do `try { ... } catch (waErr)` que já existe no auto-send. Se qualquer parte falhar, o `catch` continua engolindo o erro como hoje — **nada do fluxo principal (criação de contato, oportunidade, atividade) é tocado.**

## Alterações

### 1. `supabase/functions/meta-lead-ads-process-lead/index.ts` (única mudança backend)

Dentro do bloco existente `if (!existingId && phone && auto_send_whatsapp && template_id)`, logo após montar `templateVariables` a partir de `settings.whatsapp_template_variables`, adicionar fallback:

- Buscar `whatsapp_templates.body` pelo `whatsapp_template_id`.
- Extrair índices `{{N}}` do corpo.
- Para cada índice **não preenchido ou vazio** em `templateVariables`, aplicar default:
  - `{{1}}` → `firstName || fullName`
  - `{{2}}` → `fullName || firstName`
  - demais → `firstName || fullName`
- Se o lookup do template falhar, apenas logar e seguir com o que já tinha (comportamento atual).

Salvaguardas:
- Só sobrescreve chave **ausente ou vazia** — nunca substitui mapeamento que o usuário configurou manualmente.
- Toda a lógica adicional está dentro de `try/catch` interno; em caso de erro no SELECT, segue o comportamento atual sem quebrar.
- Não altera assinatura da chamada `twilio-whatsapp-send`, não muda RLS, não muda schema, não cria coluna nem migração.

### 2. `src/components/integrations/meta-lead-ads/SettingsCard.tsx` (UX, sem afetar runtime existente)

- Quando `templateVars.length > 0` e o input de uma variável está vazio, mostrar `placeholder="{first_name}"` na variável `{{1}}` (apenas dica visual).
- Pequeno texto auxiliar listando tokens disponíveis: `{first_name}`, `{full_name}`, `{form_name}`, `{campaign_name}`, `{ad_name}`.
- **Não** adicionar validação bloqueante no save — para não quebrar fluxos de quem já salvou com variáveis vazias. O fallback do backend cobre esses casos.

## O que NÃO vou mudar

- Schema do banco — nenhuma migração.
- `twilio-whatsapp-send` — sem alteração.
- Estrutura de `settings.whatsapp_template_variables` salvas no banco — continuam válidas.
- Demais integrações que enviam template (Twilio direto, fluxos manuais).

## Validação

1. Após deploy do edge function, checar logs do `meta-lead-ads-process-lead` na próxima chegada de lead — deve aparecer `[auto-wa] fallback var 1 => <nome>`.
2. Conferir em `/messages` que a nova mensagem chega como `Olá Cleide, ...` em vez de `Olá {{1}}`.
3. Para garantir que mapeamentos existentes continuam funcionando: organizações que já configuraram variáveis manualmente seguem usando exatamente o que cadastraram (o fallback só age em chaves ausentes/vazias).

## Arquivos

- `supabase/functions/meta-lead-ads-process-lead/index.ts` (delta ~30 linhas, dentro do try existente)
- `src/components/integrations/meta-lead-ads/SettingsCard.tsx` (delta cosmético: placeholder + hint)
