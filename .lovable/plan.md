
## Plano: Corrigir validação de "Nome" no envio para assinatura

### Problema
Ao clicar em "Enviar para Assinatura", aparece o erro dizendo que o campo "Nome" está vazio — mesmo quando o contato tem nome preenchido (ex: "Marcelo Esteves De Jesus" aparece no topo).

### Causa
No arquivo `src/components/signature/SendToSignatureButton.tsx`, a lógica que extrai o primeiro nome quebra em alguns casos:
- Quando `first_name` está vazio mas `full_name` tem espaços extras no início
- Quando os dados vieram de um webhook (Kommo, formulário) e ficaram com espaços ou strings vazias
- O `split(' ')[0]` retorna string vazia se o nome começar com espaço

### Solução
Tornar a extração do nome mais robusta:

1. **Limpar espaços** de todos os campos do contato antes de validar (usar `.trim()`)
2. **Dividir o nome corretamente** usando expressão que ignora múltiplos espaços
3. **Cascata de fallback** para o primeiro nome:
   - Tenta `first_name`
   - Se vazio, pega a primeira palavra de `full_name`
   - Se ainda vazio, aí sim mostra erro
4. **Reaproveitar o nome resolvido** no payload enviado ao SuvSign (hoje a validação e o envio usam lógicas diferentes)
5. Aplicar o mesmo `.trim()` nos demais campos obrigatórios (CPF, RG, endereço, etc.) para evitar que valores com só espaços passem como "preenchidos" ou sejam marcados como vazios incorretamente

### Arquivo alterado
- `src/components/signature/SendToSignatureButton.tsx` (apenas a função `handleSendToSignature`, ~15 linhas)

### Resultado esperado
O botão "Enviar para Assinatura" vai abrir o SuvSign normalmente para contatos que têm nome preenchido, mesmo se os dados vieram com espaços extras ou apenas no campo `full_name`.
