// Geração do nome de exibição e do vencimento de um documento.
// Nome: "<Tipo> — <Parte> — <Referência>" (ISO, ≤120 chars, blocos vazios omitidos).
// Parte = primeiro nome + último sobrenome. Referência conforme reference_kind.

export type ReferenceKind = 'none' | 'date' | 'month' | 'period';
export type ValidityMode = 'none' | 'derived' | 'stated';

// Entrada do wizard (strings de <input>): date/period usam `date` (yyyy-mm-dd) e
// period também `endDate`; month usa `month` (yyyy-mm).
export interface ReferenceInput {
  date?: string | null;
  month?: string | null;
  endDate?: string | null;
}

// Colunas de referência em `documents`.
export interface ReferenceColumns {
  reference_date: string | null;
  reference_month: string | null; // dia 1
  reference_end_date: string | null;
}

export function referenceColumns(kind: ReferenceKind, ref?: ReferenceInput): ReferenceColumns {
  const empty: ReferenceColumns = { reference_date: null, reference_month: null, reference_end_date: null };
  if (!ref) return empty;
  if (kind === 'date') return { ...empty, reference_date: ref.date || null };
  if (kind === 'period') return { ...empty, reference_date: ref.date || null, reference_end_date: ref.endDate || null };
  if (kind === 'month') return { ...empty, reference_month: ref.month ? `${ref.month.slice(0, 7)}-01` : null };
  return empty;
}

function partShort(partyName?: string | null): string {
  const parts = (partyName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function referenceLabel(kind: ReferenceKind, ref?: ReferenceInput): string {
  if (!ref) return '';
  if (kind === 'date' || kind === 'period') return ref.date || ''; // period mostra só o início
  if (kind === 'month') return ref.month ? ref.month.slice(0, 7) : ''; // yyyy-mm
  return '';
}

export function buildDisplayName(params: {
  typeName: string;
  partyName?: string | null;
  referenceKind: ReferenceKind;
  reference?: ReferenceInput;
}): string {
  const blocks = [params.typeName, partShort(params.partyName), referenceLabel(params.referenceKind, params.reference)]
    .map((b) => (b ?? '').trim())
    .filter((b) => b.length > 0);
  return blocks.join(' — ').slice(0, 120);
}

// Vencimento materializado. stated: a própria data do documento é a validade.
// derived: referência + validity_days. Caso contrário, null.
export function computeExpiresAt(
  validityMode: ValidityMode,
  validityDays: number | null,
  referenceKind: ReferenceKind,
  ref?: ReferenceInput,
): string | null {
  const baseDate = ref?.date || (ref?.month ? `${ref.month.slice(0, 7)}-01` : null);
  if (!baseDate) return null;
  if (validityMode === 'stated') return baseDate;
  if (validityMode === 'derived' && validityDays != null) {
    const d = new Date(`${baseDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + validityDays);
    return d.toISOString().slice(0, 10);
  }
  return null;
}
