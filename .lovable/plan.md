# Erro ao excluir oportunidade

## Causa (confirmada)
"Excluir" não apaga a oportunidade: ele a manda para a lixeira, gravando a data de exclusão (`deleted_at`). O banco recusou essa gravação:

```text
PATCH /opportunities?id=in.(1bc14fde…)  body {"deleted_at": "..."}
403  42501  new row violates row-level security policy for table "opportunities"
```

Por que o banco recusa:
- A regra de leitura atual de oportunidades só mostra itens com `deleted_at IS NULL`.
- O Postgres exige que a linha continue visível para quem a alterou. Ao marcar a oportunidade como excluída, ela deixa de ser visível para o usuário, e a alteração é negada.
- Antes existia uma segunda regra de leitura, "Users can view deleted opportunities in trash" (criada em 30/11/2025), que liberava ver os itens da lixeira. A mudança de 19/04/2026 (`20260419204912…`, registros privados) apagou **todas** as regras de leitura de oportunidades e recriou só a principal. A regra da lixeira foi apagada junto por engano.
- Evidência: a última oportunidade excluída no banco é de 10/04/2026. Desde então, nenhuma exclusão funcionou para usuários comuns (administradores do sistema passam).
- Contatos e tarefas continuam com a regra de lixeira e por isso excluem normalmente. Só oportunidades ficaram sem.

Afeta o botão "Excluir" em massa do Kanban, a exclusão individual e o Kanban do celular — todos usam a mesma gravação.

## Correção proposta
Uma migration que recria somente a regra perdida, idêntica à original e à de contatos/tarefas:

```sql
CREATE POLICY "Users can view deleted opportunities in trash"
ON public.opportunities FOR SELECT
USING (user_has_org_access(organization_id) AND deleted_at IS NOT NULL);
```

- Não muda a regra principal, os registros privados, o código do app nem o fluxo de exclusão.
- Efeito colateral, o mesmo de antes de abril: membros da organização conseguem ver oportunidades que estão na lixeira. A tela de Lixeira depende disso.
- [INCERTO] Com registros privados ligados, a lixeira mostra oportunidades excluídas de outros donos da mesma organização. Hoje contatos e tarefas já funcionam assim. Se preferir restringir ao dono ou a quem vê tudo, dá para ajustar na mesma regra.

## Validação
- Conferir que a regra foi criada.
- Você repete a exclusão da oportunidade "Teste" (Alan Vital) e ela deve ir para a lixeira sem erro.
- Oportunidades excluídas continuam fora do Kanban.
