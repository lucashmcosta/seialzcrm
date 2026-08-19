# Passo 1 "Destino" dentro do modal Evolution WhatsApp

## Auditoria (read-only)

EVOLUTION_MODAL_RENDER_COMPONENT=`src/components/integrations/evolution-whatsapp/EvolutionWhatsAppDialog.tsx` (aberto por `src/components/settings/IntegrationsSettings.tsx:722`), que renderiza `<EvolutionProvisionPanel />` na linha 361.

CONNECT_NEW_NUMBER_HANDLER=`EvolutionProvisionPanel.tsx` — botão "Conectar novo número" chama `openStep1({ mode: 'create' })`, que abre um `<Dialog>` aninhado (Passo 1) e só depois chama `onCreate()` → `useCreateEvolutionInstance`.

DESTINATION_STEP_CURRENTLY_RENDERED_WHERE=`EndpointDestinationStep` está sim dentro de `EvolutionProvisionPanel.tsx` (linhas 419-450), porém dentro de um Dialog aninhado ao Dialog da integração — não como etapa visível no corpo do modal.

WHY_NOT_VISIBLE_IN_THIS_MODAL=O módulo servido pelo dev server é a versão ANTIGA do componente: o transform servido em `/src/components/.../EvolutionProvisionPanel.tsx` não contém `step1`, `openStep1` nem `EndpointDestinationStep` — apenas o fluxo antigo (clique cria a sessão direto). Ou seja, o arquivo em disco tem a etapa, mas o preview executa o bundle anterior. Somado a isso, o desenho atual usa Dialog-dentro-de-Dialog, que é frágil e não é o que foi combinado ("dentro deste modal").

IS_WRONG_COMPONENT_BEING_EDITED=NO

IS_FEATURE_BEHIND_STATE_OR_CONDITION=NO (não há flag; depende apenas de `step1 !== null`)

IS_PREVIEW_RUNNING_OLD_COMPONENT=YES

MINIMAL_FIX=Transformar o Passo 1 em uma seção inline no corpo do próprio modal (sem Dialog aninhado) e forçar a reinvalidação do módulo no preview.

## O que será feito (somente UI)

1. Em `EvolutionProvisionPanel.tsx`, remover o `<Dialog>` aninhado do Passo 1 e renderizar o mesmo conteúdo como um bloco inline, logo abaixo do cabeçalho "Números Evolution":
   - Título "Passo 1 — Destino do número"
   - `EndpointDestinationStep` (Comercial / Atendimento / Pessoal + Select de responsável obrigatório quando Pessoal)
   - Botões "Cancelar" e "Continuar" (Continuar desabilitado sem responsável quando Pessoal)
2. Fluxo preservado exatamente: Continuar → cria sessão Evolution → mostra QR → conectar → "Vincular a <Destino>".
3. Sessões pendentes antigas continuam com "Escolher destino", que abre o mesmo bloco inline em modo `assign`.
4. Ajustar o comentário de cabeçalho do arquivo, que ainda diz que o vínculo é feito em "WhatsApp Comercial".
5. Rodar typecheck + build e confirmar que o módulo servido pelo dev server passa a conter a etapa (verificação objetiva via requisição ao dev server).

## Fora de escopo

Sem alteração de backend, RPC, Edge Functions, provisionamento ou lógica de QR. Nenhuma mudança na tela "WhatsApp Comercial".

Depois do diff eu paro para sua validação visual.
