# Motor de classificação — histórico de versões

Regra: patch = texto/correção sem mudar resultado dos casos-ouro · minor = pergunta/tese nova · major = regra que muda resultado.
Toda mudança de resultado precisa de casos-ouro novos aprovados pelo Lucas.

## 1.0.0 — 16/10/2026

Primeira versão para o Seialz. É uma porta fiel do protótipo `motor_comercial_v3.html` validado com o jurídico.
Paridade: 21.000 casos aleatórios (91.370 teses) idênticos ao protótipo; 107.145 perguntas idênticas às do assistente do vendedor.

Correções feitas na conferência (aplicadas também nos protótipos):
- Divisão segura: chance-base da gestante (dispensa) ou da estabilidade B91 calibrada em 0%, ou situação de dano moral com valor 0, não trava mais o cálculo.
- Insalubridade, "Qual grau recebe hoje?": a tela passa a mostrar 20% marcado, que é o que o cálculo sempre assumiu (nenhum resultado muda).
