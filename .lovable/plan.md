

# Problema: Edge Function não deployada

O código do `kommo-preview` já está correto com contagens exatas (paginação completa). O problema é que a **Edge Function não foi deployada** — o preview ainda roda a versão antiga que retorna "250+".

A evidência está no screenshot:
- Contagens mostram "250+" (lógica antiga)
- Tempo estimado mostra "~NaN min" (provavelmente campo `has_more` antigo causando cálculo inválido)

## Plano

1. **Deploy da Edge Function `kommo-preview`** — a versão local já tem `getExactCount` com paginação completa
2. **Verificar se o `selectedTotal` não gera NaN** — a fórmula `Math.ceil(selectedTotal / 100 / 60)` está correta, mas se `total_contacts` vier como string "250+" do backend antigo, o cálculo quebra

Não há mudança de código necessária — apenas o deploy da função atualizada.

