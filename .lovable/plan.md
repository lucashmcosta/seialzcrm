# Tipificação obrigatória no upload de documentos

## Situação confirmada
- `document_types`: 135 tipos ativos no catálogo global (`organization_id = NULL`) e apenas 5 registros antigos por organização (soft-deletados).
- `organization_document_types` existe (`organization_id`, `document_type_id`, `is_enabled`, `sort_order`) mas está **vazia** e não é lida por nenhum código.
- Frontend (`useDocumentTypes`, `useEntityDocuments`, `OpportunityCloseSettings`) filtra `organization_id = orgId`, então o catálogo global fica invisível → tela de Configurações vazia e checklist não renderiza.
- Hoje 4.845 de 4.866 documentos estão sem `document_type_id`, e é isso que faz o payload do Nammux sair com `document_submissions` vazio.

## O plano

### 1. Ligar o catálogo global à organização
- Passar a ler tipos por união: tipos globais habilitados via `organization_document_types` + tipos próprios da organização.
- Criar a leitura em uma função no banco (ex.: `rpc_list_document_types(p_organization_id)`) para um único lugar de verdade, usada pelos três consumidores.
- Semeamento inicial: habilitar para Central Trabalhista e Viagi os tipos globais que já fazem sentido (os que o Nammux espera e os usados na tipificação do Jonas), deixando o restante do catálogo disponível para habilitar depois.

### 2. Configurações → Documentos passa a ser tela de curadoria
- Duas áreas: **Tipos habilitados** (do catálogo, com ordem e "obrigatório" por organização) e **Tipos próprios** (CRUD atual, mantido).
- Ação "Adicionar do catálogo": busca nos 135 tipos globais e liga/desliga via `organization_document_types` (`is_enabled`, `sort_order`).
- "Obrigatório" e ordem passam a ser por organização no vínculo, não no tipo global.

### 3. Obrigar o tipo no upload
- No `DocumentsPanel`, o botão "Adicionar arquivo" deixa de enviar direto: abre um diálogo que exige escolher o tipo (combobox com busca sobre os tipos habilitados) antes de confirmar o envio.
- Sem tipo selecionado, o botão de confirmar fica desabilitado — não existe mais caminho de upload avulso pela UI.
- Se a organização não tiver nenhum tipo habilitado, o painel mostra estado vazio com link para Configurações → Documentos, em vez de cair no upload livre.
- Slots do checklist ("Enviar"/"Substituir") continuam funcionando como hoje, já tipificados.

### 4. Fechar a porta no banco
- `documents.document_type_id` passa a ser obrigatório para novos registros de entidades de negócio (contato/oportunidade), preservando as linhas históricas nulas — via trigger de validação, não CHECK, para não invalidar o legado.
- Anexos de mensagem/mídia de conversa, se gravarem em `documents`, ficam explicitamente fora dessa exigência.

### 5. Legado
- Os 4.845 documentos sem tipo não são tocados automaticamente. Na UI eles ganham um aviso "Sem tipo" com ação de tipificar, para limpeza sob demanda (o caso Jonas mostrou que tipificar + replay do evento resolve no Nammux).
- Backfill em massa fica como decisão separada, fora deste escopo.

## Detalhes técnicos
- Migração: `organization_document_types` ganha grants/RLS de leitura por membros da org e escrita por administradores; nova RPC de listagem; trigger de validação em `documents`.
- Arquivos afetados: `src/hooks/documents/useDocumentTypes.ts`, `src/hooks/documents/useEntityDocuments.ts`, `src/components/settings/DocumentsSettings.tsx`, `src/components/documents/DocumentsPanel.tsx`, `src/components/settings/OpportunityCloseSettings.tsx`, mais o painel mobile de documentos se existir.
- `src/integrations/supabase/types.ts` é regenerado após a migração; nada é editado à mão.
- Documentação: atualizar `docs/modules/settings/data-model.md` e o módulo de documentos com o novo modelo catálogo global + vínculo por organização.

## Fora do escopo
- Alterar o contrato do payload Nammux.
- Workflow de aprovação/revisão de documentos.
- Backfill automático dos documentos históricos.
