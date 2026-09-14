# Quem desativou Tiago, Thauan e Leandro

## O que o sistema guarda hoje

Os três estão desativados na Central Trabalhista, com estes horários de alteração:

- Thauan Xavier — 11/09/2026, 13:27 (horário de São Paulo)
- Leandro Buttini — 11/09/2026, 13:28
- Tiago Ribeiro — 11/09/2026, 13:28

O autor da ação **não foi registrado**. O histórico de alterações só é gravado para
contatos, oportunidades, tarefas, empresas, organizações e uma configuração de consulta —
a tabela de vínculos de usuário não tem registro de histórico. Também não há nada nos
registros da área administrativa nem de acesso em nome de outra pessoa nesse período.

Ou seja: sabemos exatamente quando, mas hoje é impossível dizer quem. As três ações
aconteceram em menos de um minuto e meio, o que indica uma única pessoa desativando em
sequência na tela de Usuários.

## Correção proposta

Passar a registrar ativação/desativação de usuários, para que a próxima vez tenha autor:

1. Gravar no histórico toda mudança no vínculo do usuário com a organização (quem alterou,
   o que mudou, quando).
2. Mostrar essa informação na tela de Usuários, na linha de cada pessoa (ex.: "Desativado
   por Junior Domingos em 11/09/2026 13:28").

Isso não muda nada no comportamento atual de ativar/desativar.

## Detalhes técnicos

- Trigger `AFTER INSERT/UPDATE/DELETE` em `public.user_organizations` gravando em
  `public.audit_logs` (`entity_type = 'user_organizations'`), com `changed_by_user_id =
  current_user_id()` e `organization_id` da linha; reaproveitar o padrão de
  `audit_log_trigger` já usado nas outras tabelas.
- Sem alteração de schema em `user_organizations`, sem novos grants, sem mudança de RLS.
- Frontend: leitura dos eventos `user_organizations` em `audit_logs` na tela
  Configurações → Usuários para exibir autor/data da última mudança de status.
- Não é possível reconstruir retroativamente o autor das três desativações de 11/09.
