# ADR-0014 — Análise da conversa inteira, dentro da org

Status: proposto (2026-11-11). Migration `20261111180000_conversation_analyses.sql`, ainda não aplicada.

## Decisão
- A análise de vendas lê a **conversa inteira** de cada oportunidade fechada (textos, áudios transcritos e silêncios longos, em ordem) e não uma mensagem isolada. A análise por mensagem (`message_analyses`) continua como está até ser revista.
- Roda **dentro da org**: usa só a chave do Claude da própria org (BYOK verificado ou chave antiga `claude-ai`). Sem chave, a função recusa. O Seialz não paga essa IA. O texto da conversa não é exportado: a função monta tudo no servidor e grava o resultado nas tabelas da org.
- Vale para todas as orgs. O prompt é genérico e lê `intelligence_settings.analysis_profile`.
- Vai em lote (Message Batches da Anthropic), que custa metade do preço normal. Toda rodada exige `budget_usd`, e a função recusa se o custo estimado passar dele. Também respeita o limite mensal da chave BYOK. O custo real vai para `ai_usage_logs` (`conversation_analysis` e `conversation_analysis_report`).
- Saída por esquema JSON (`output_config.format`), sem `tool_choice` forçado, porque os modelos 5.5 recusam esse pedido.
- Duas tabelas: `conversation_analysis_runs` (rodada, teto, custo, relatório em `result`) e `conversation_analyses` (uma linha por oportunidade). A leitura é por org via RLS, e só a função escreve.

## Por quê
Uma mensagem isolada não mostra onde a conversa morre, que resposta venceu uma objeção nem o que quem ganha faz de diferente. A conversa é do cliente da org, então a análise usa a chave e o espaço da org.
