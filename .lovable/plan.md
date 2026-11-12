# Redistribuir conversas da Julia para as Consultoras (Central Trabalhista)

## O que encontrei
Hoje há 10 conversas abertas do Comercial ainda com a Julia (IA):
- 9 estão sem responsável.
- 1 (Antônio Souza) já tem responsável e vai continuar com ela; só sai a Julia.

## O que será feito
1. Dividir as 9 conversas sem responsável em partes iguais, alternando, por ordem de chegada:
   - Ketlyn Vieira: 3
   - Talita Soares: 3
   - Tamires Sousa: 3
2. Tirar a Julia das 10 conversas, para ela parar de responder, registrando o motivo "redistribuição manual para Consultoras".
3. Registrar o histórico de atribuição de cada conversa e mandar no máximo 1 aviso interno por consultora com o resumo.

## O que NÃO será feito
- Nenhuma mensagem para os clientes.
- O dono dos contatos não muda.
- Atendimento, rodízio, configurações da Julia e conversas de outras organizações não são tocados.

## Detalhes técnicos
- Alvo: `message_threads` da org `40ae935c…`, `status='open'`, `business_context` sales ou nulo, `ai_agent_id` preenchido, sem `ai_agent_released_at`/`ai_agent_closed_at`.
- Seguir o mesmo caminho da atribuição em lote de 09/10: gravar `assigned_user_id`/`assigned_at`, `ai_agent_released_at=now()`, `ai_agent_release_reason`, histórico e notificação-resumo.
- Antes de gravar, conferir os IDs das consultoras e se elas têm permissão no Comercial; depois mostrar o resultado conversa por conversa e um script para desfazer.
