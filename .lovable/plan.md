## Rebalancear colunas da aba "Visão Geral"

Hoje a coluna esquerda tem 3 itens e a direita tem 8+, ficando totalmente desigual. Vou redistribuir para que as duas colunas fiquem com peso parecido.

### Nova distribuição (4 + 4)

**Coluna esquerda:**
1. Valor
2. Estágio
3. Data de fechamento
4. Status
5. Etiquetas

**Coluna direita:**
1. Contato
2. Responsável
3. Criado em
4. Atualizado em
5. Criado por
6. Atualizado por

### Mudanças no `OpportunityDetail.tsx` (linhas 372–470)

- Mover **Status** (atualmente direita) para a coluna esquerda, logo após "Data de fechamento"
- Mover **Etiquetas** (`TagSelector`, hoje na direita no fim) para o final da coluna esquerda
- Manter Contato, Responsável, Criado em, Atualizado em, Criado por, Atualizado por na coluna direita
- Nenhuma mudança de estilo, fontes, lógica de fetch ou comportamento — só reordenação dos blocos `<div>` entre as duas `<div className="space-y-4">`
