// Opções de campos personalizados do tipo Lista.
// Formato em custom_field_definitions.options: { options: [{ label, value, contract_text? }] }
//  - label: o que aparece no Seialz
//  - value: o que fica salvo (estável; não muda se o texto do contrato mudar)
//  - contract_text: texto usado no contrato no lugar da opção (opcional; se vazio, usa o label)
export interface FieldOption { label: string; value: string; contract_text?: string }

export function selectOptions(raw: unknown): FieldOption[] {
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as { options?: unknown }).options))
    ? (raw as { options: unknown[] }).options : [];
  return list.flatMap((o) => {
    if (typeof o === 'string') return o.trim() ? [{ label: o.trim(), value: o.trim() }] : [];
    if (!o || typeof o !== 'object') return [];
    const r = o as Record<string, unknown>;
    const label = String(r.label ?? r.value ?? '').trim();
    const value = String(r.value ?? r.label ?? '').trim();
    if (!label || !value) return [];
    const ct = typeof r.contract_text === 'string' ? r.contract_text.trim() : '';
    return [{ label, value, ...(ct ? { contract_text: ct } : {}) }];
  });
}

/** Nome técnico do campo: minúsculas, sem acento, só letras/números/_ (usado como variável do contrato). */
export function slugFieldName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
