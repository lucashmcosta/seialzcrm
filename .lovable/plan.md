## Problema

Campos `DATE` do Postgres (ex.: `opportunities.close_date`) chegam ao frontend como `"YYYY-MM-DD"`. Ao fazer `new Date("2026-05-08")`, o JS interpreta como **UTC meia-noite**, e `toLocaleDateString` em fuso BRT (-03) renderiza como `07/05/2026`. O salvamento no banco está correto — só a exibição vai 1 dia para trás.

## Solução

Criar um helper único e aplicar em todos os pontos que renderizam strings vindas de colunas DATE (sem hora).

### 1. Adicionar helpers em `src/lib/utils.ts`

```ts
export function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function formatDateOnly(
  value?: string | null,
  locale = 'pt-BR',
  options: Intl.DateTimeFormatOptions = {},
): string {
  const d = parseDateOnly(value);
  if (!d) return '';
  return d.toLocaleDateString(locale, { timeZone: 'UTC', ...options });
}
```

### 2. Substituir nos arquivos que renderizam `close_date` (campo DATE)

- `src/pages/opportunities/OpportunityDetail.tsx` — linhas 277 e 370: trocar `new Date(opportunity.close_date).toLocaleDateString(locale)` por `formatDateOnly(opportunity.close_date, locale)`.
- `src/components/contacts/ContactOpportunities.tsx` — linha 175: idem.
- `src/pages/opportunities/OpportunitiesKanban.tsx` — `formatDate` (linha 646): trocar por `parseDateOnly` + `format(..., { locale })` do date-fns usando `Date.UTC` (ou simplesmente usar `formatDateOnly` com `{ day: '2-digit', month: 'short', year: 'numeric' }`).
- `src/components/opportunities/OpportunityCard.tsx` — linha 71: idem para `closeDate`.
- `src/components/opportunities/SeialzOpportunityCard.tsx` — linha 136: idem.
- `src/components/signature/SendToSignatureButton.tsx` — linha 124: já usa `+ 'T00:00:00'` (parsing local), trocar para `parseDateOnly` por consistência (não causa o bug, mas padroniza).

### 3. Tasks (`tasks.due_at` é `TIMESTAMPTZ`)

`due_at` carrega hora e fuso, então **não tem o bug**. Porém o `<input type="date">` no `TaskDialog.tsx` linha 221 faz `new Date(formData.due_at).toISOString()` — isso converte `"2026-05-08"` (UTC midnight) para ISO; em fusos negativos pode aparecer como dia anterior em alguns formatos. Manter sem mudança: como `due_at` é timestamp e o input é só data, preservar `"YYYY-MM-DDT00:00:00.000Z"` está OK. (Não alterar nesta task para não regredir o agendamento de tarefas.)

### 4. Não alterar

- Salvamento de `close_date` no `OpportunityDialog.tsx` (linha 295) — `<input type="date">` retorna `"YYYY-MM-DD"` puro, gravado correto.
- Renderização de campos `*_at` (timestamps com hora) — não sofrem do bug.
- Funções de parse de datas em `MessagesList`, `ReportsPage`, etc. — operam sobre timestamps.

## Resultado esperado

A data salva (ex.: `2026-05-08`) será exibida como **08/05/2026** em todos os contextos, independente do fuso do navegador.
