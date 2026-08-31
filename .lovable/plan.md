# Exportar os 15 ganhos do Evolution (7020) para download

Gerar um arquivo de planilha, disponível para download no chat, com os 15 contatos ganhos originados no endpoint Evolution `+55 11 5028-7020` (Central Trabalhista, ativo desde 14/08/2026).

## Conteúdo do arquivo

Uma linha por contato, com as colunas:

- Nome
- Telefone
- E-mail
- Responsável
- Data do ganho (mais recente)
- Quantidade de oportunidades ganhas

Total: 15 contatos / 16 oportunidades ganhas (Silvia Almeida de Oliveira tem duas).

## Formato

Dois arquivos em `/mnt/documents`, anexados no chat:

- `ganhos-evolution-7020.csv` (para importar em outros sistemas)
- `ganhos-evolution-7020.xlsx` (cabeçalho em negrito, colunas dimensionadas, telefone e datas como texto/data legível)

## Detalhes técnicos

- Consulta somente leitura, idêntica à já validada: contatos com `message_threads.primary_endpoint_id = 3ed219e0-b919-4a1f-b2f6-6806cfafe6f7`, filtrados por `contacts.created_at >= created_at do endpoint`, unidos a `opportunities` com `status = 'won'` e `deleted_at is null`.
- Nenhuma alteração de dados, schema ou código da aplicação.
