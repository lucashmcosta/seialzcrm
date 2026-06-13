## Remover navegação nas linhas do modal de "piores casos"

**Arquivo:** `src/components/reports/ServiceResponseDetailDialog.tsx`

- Remover `onClick` que navega para `/messages?thread=...`
- Remover `cursor-pointer` e `hover:bg-muted/40` das linhas (deixar só o `border-b` divisor)
- Remover o import e uso de `useNavigate` (não é mais necessário)

Resto do modal (mediana, p90, máximo, top 20) continua igual.