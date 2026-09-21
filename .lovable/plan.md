# Destravar a lista de conversas do app (ambiguidade de função)

## Respostas às perguntas

- **O web sempre envia `p_endpoint_ids`?** Sim. O único ponto do web que chama essa função envia o parâmetro em todas as chamadas (primeira página e "carregar mais"), com valor nulo quando não há filtro por número.
- **O web chama em mais de um lugar?** Não. Tanto a tela Comercial do desktop quanto a versão mobile do site usam o mesmo hook compartilhado — uma única chamada.
- **Alguma rotina de servidor (edge function/job) chama a versão antiga?** Não. Nenhuma função de servidor referencia essa listagem.
- **Situação real no banco:** existem **três** versões, não duas — uma sem `p_search` (8 parâmetros), uma com `p_search` (9) e a nova com `p_endpoint_ids` (10). A chamada do app (que inclui `p_search`) hoje casa com a de 9 e a de 10 → erro PGRST203.

## Caminho escolhido

**Opção 1 — tirar o valor padrão de `p_endpoint_ids`.** É a menos invasiva e segura aqui, porque o web sempre envia esse parâmetro e nada mais depende da versão nova.

Resultado:
- Chamada do app (6 parâmetros, sem `p_endpoint_ids`) → resolve só na versão de 9 parâmetros.
- Chamada do web (com `p_endpoint_ids`) → resolve só na versão de 10.
- Nenhuma mudança no app publicado nem no web.

Além disso, remover a versão antiga de 8 parâmetros (sem `p_search`), que não tem nenhum chamador e é uma segunda fonte latente do mesmo erro para chamadas sem busca.

## Passos

1. Migration: recriar a versão de 10 parâmetros com `p_endpoint_ids uuid[]` **sem default**, corpo idêntico ao atual, mantendo `SECURITY DEFINER`, `STABLE`, `search_path` e os grants (`authenticated`, `service_role`); revogar de `public`/`anon`.
2. Migration: remover a versão de 8 parâmetros (sem `p_search`), após confirmar ausência de chamadores.
3. Verificar no banco que restam exatamente duas versões: 9 e 10 parâmetros.
4. Validar pela API com os seis parâmetros do app (`p_organization_id`, `p_channels`, `p_limit`, `p_search`, `p_assigned_user_id`, `p_unassigned_only`) — deve retornar conversas, sem PGRST203.
5. Validar o web na tela Comercial: primeira página, "carregar mais", filtro por número (7067/7020), filtro por responsável e ausência do 7027.
6. Documentação: atualizar `docs/modules/messages/data-model.md`, `docs/operations/conflicts.md` e `docs/platform/database/README.md` (drift #7 dos overloads) com as assinaturas finais e a regra de que a versão nova exige `p_endpoint_ids` explícito.

## Garantias mantidas

- Nomes e significados dos parâmetros inalterados.
- Campos de retorno inalterados: `id`, `status`, `contact_id`, `contact_name`, `contact_phone`, `assigned_user_id`, `assigned_user_name`, `last_message_content`, `last_message_at`, `last_message_direction`, `is_unread`, `last_inbound_at`, `whatsapp_last_inbound_at`.
- Isolamento por organização, validação de membro ativo, permissões de ver todas as conversas, contexto comercial, busca, cursor e ordenação atuais preservados.
- Nenhuma tabela, dado, RLS, edge function ou integração é alterada.
