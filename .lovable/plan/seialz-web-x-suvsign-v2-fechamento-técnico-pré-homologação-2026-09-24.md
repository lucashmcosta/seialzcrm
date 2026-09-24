# Seialz Web x SuvSign V2 — fechamento técnico pré-homologação

Escopo: somente os itens 1–8 do documento. Sem credencial real, sem webhook SuvSign, sem regra LIVE, flag global OFF, 0 orgs habilitadas.

## Achado confirmado (bloqueia o item 1)
- A V2 grava o PDF com `documents.external_source = 'suvsign_v2'`.
- O helper V1 `ensureContactContractOwnershipAndDelivery` (em `suvsign-webhook/index.ts`) rejeita tudo que não é `'suvsign'`.
- A RPC `fn_enqueue_nammux_contact_contract_replays_v1` também pula (`not_contact_suvsign_contract`) quando a origem não é `'suvsign'`.
- Resultado: hoje o contrato V2 nunca chega ao Nammux. A activity V2 já é deduplicada por `source_external_id`; o documento por `(external_source, external_ref)`.

## 1. Paridade Nammux (sem segundo pipeline)
- Mover `ensureContactContractOwnershipAndDelivery` para `_shared/suvsign-contract-delivery.ts`, código idêntico, com a checagem de origem aceitando `suvsign` e `suvsign_v2`. V1 passa a importar do shared (comportamento V1 idêntico, verificado por diff).
- Migration: na RPC de replay (e em `fn_build_opportunity_won_payload`, se filtrar por origem — confirmar ao ler), trocar `is distinct from 'suvsign'` por `not in ('suvsign','suvsign_v2')`. Nada mais muda na função.
- `suvsign-v2-webhook` em `document.completed`: após gravar/achar o documento (também no caminho "já existe"), chamar o helper. Idempotência do outbox fica na `idempotency_key` já existente da RPC.
- Teste em transação com rollback (org QA, contato, oportunidade ganha, doc `suvsign_v2`): 1ª chamada insere job; 2ª chamada insere 0. Mais retry simulado do webhook: 1 documento, 1 activity, 1 job.

## 2. Webhook separado — justificativa a documentar
- Motivo: a V2 identifica a org pelo `operation_id` → `signature_requests` e valida com o secret V2 da org. A V1 resolve por outro caminho/secret; separar evita mexer no V1 e deixa o rollback isolado.
- Coexistência: a V2 recusa payload sem `engine: "v2"` (400). Confirmar e documentar que a V1 ignora/recusa `engine: "v2"`; se não recusar, adicionar guard mínimo no V1 (só descartar V2, sem outra mudança).
- Documentar: URL por conta, se o webhook é por conta ou por operação (conferir no contrato SuvSign publicado; marcar [INCERTO] se não estiver explícito), V1+V2 simultâneos na mesma org, rollback = flag OFF sem mudar o endpoint das operações V2 que já existem.

## 3. As 11 ações
Documentar as 11: `get_capability`, `get_credentials_status`, `save_credentials`, `test_connection`, `list_templates`, `prepare_contract`, `get_preview`, `send_for_signature`, `get_signature_status`, `cancel_signature`, `get_download_url`. Justificar as 4 extras e revisar no código que nenhuma é um proxy genérico, todas checam auth/tenant e nenhuma devolve segredo.

## 4. Credenciais só no servidor
Testes direto no banco (`has_table_privilege` para anon/authenticated, policies, varredura de views/RPCs que leem a tabela, colunas cifradas, grep por logs de segredo, retorno mascarado em `get_credentials_status`).

## 5. Template do piloto
Listar os templates disponíveis e cruzar as variáveis com o mapa de autopreenchimento do Seialz (resolvida / não resolvida / obrigatória). Sem credencial V2 real não dá pra listar templates ao vivo → usar o contrato/snapshot publicado; se não houver template identificável, reportar como bloqueio real e pedir o nome do template.

## 6. RLS A/B e dono da oportunidade
Em uma transação com rollback: criar orgs, usuários e oportunidades QA mais `signature_requests` QA e simular sessões com `set local role authenticated` + claims JWT. Casos: A vê A; B não vê A; na mesma org, quem não tem acesso à oportunidade não vê; admin/ver-todos segue a policy. Nada fica gravado.

## 7–8. Estado final e relatório
Checar a regressão V1 (webhook V1 responde; 425 documentos V1 sem mudança; diff do helper), a flag OFF, 0 orgs e 0 regras LIVE. Atualizar `docs/integrations/suvsign-v2.md` e `roadmap.md`. Entregar a resposta em 18 itens, no formato pedido.
