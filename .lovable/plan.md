# Remover a classificação do cliente teste "Joao Teste"

Oportunidade "TESTE Classificação A" (#6CD57486), Central Trabalhista. Classificação Ouro de 19/10/2026, comissão R$ 250.

## O que será apagado (só desta oportunidade)
- 1 classificação do processo (`process_classifications` 08e7b870…)
- 1 resultado de cálculo ligado a ela (`process_classification_results`)
- 1 pedido de correção ligado a ela (`classification_correction_requests`)
- 1 comissão da oportunidade (`opportunity_commissions`)

## O que fica como está
- Contato, oportunidade (continua "Ganho"), conversas, documentos e histórico.
- Nenhuma alteração de código, regra ou outra organização.

Depois disso, o quadro "Classificação do processo" volta a ficar vazio para essa oportunidade.

## Detalhes técnicos
- Antes de apagar: listar as linhas e confirmar as contagens (1/1/1/1), todas com `organization_id` da Central.
- Apagar na ordem: pedido de correção, resultado, comissão, classificação, tudo filtrado pelo id da classificação ou da oportunidade.
- Se algum gatilho de proteção bloquear a exclusão (a classificação está "final" porque a oportunidade está fechada), paro e explico, sem desligar proteção.
- Confirmar depois que as quatro contagens estão em 0.
