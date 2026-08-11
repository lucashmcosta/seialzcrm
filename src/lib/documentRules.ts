import { z } from 'zod';

// Regras de documento para FECHAR a oportunidade. Moram em
// opportunity_close_policies.document_rules (jsonb). Shape v2 = sets/when/priority,
// `required` por CÓDIGO. Resolve UM set (maior priority cujo `when` bate; when:null =
// default). Avaliação canônica é server-side em evaluate_opportunity_close_internal_v1.

export const WhenConditionSchema = z.object({
  field: z.string().uuid(),                 // custom_field_definition id
  op: z.enum(['eq', 'in']).default('eq'),
  value: z.union([z.string(), z.array(z.string())]),
});

// `when`: AND (all) e/ou OR (any). Ambos presentes => os dois têm de valer.
export const WhenSchema = z
  .object({
    all: z.array(WhenConditionSchema).optional(),
    any: z.array(WhenConditionSchema).optional(),
  })
  .nullable();

// Item exigido: um CÓDIGO único (string) OU um grupo de alternativas — qualquer
// um dos códigos satisfaz (ex.: identidade = RG ou CNH). `label` é opcional.
export const RequiredGroupSchema = z.object({
  anyOf: z.array(z.string().min(1)).min(1),
  label: z.string().optional(),
});
export const RequiredItemSchema = z.union([z.string(), RequiredGroupSchema]);

export const DocumentSetSchema = z.object({
  id: z.string().min(1),
  priority: z.number().int().default(0),
  when: WhenSchema.default(null),
  required: z.array(RequiredItemSchema).default([]),
});

export const DocumentRulesSchema = z.object({
  version: z.number().int().default(2),
  sets: z.array(DocumentSetSchema).default([]),
});

export type WhenCondition = z.infer<typeof WhenConditionSchema>;
export type RequiredGroup = z.infer<typeof RequiredGroupSchema>;
export type RequiredItem = z.infer<typeof RequiredItemSchema>;
export type DocumentRules = z.infer<typeof DocumentRulesSchema>;
export type DocumentSet = z.infer<typeof DocumentSetSchema>;

// Parse tolerante: aceita o shape v2; legado {version:1, rules:[]} vira sets vazio.
export function parseDocumentRules(raw: unknown): DocumentRules {
  const r = DocumentRulesSchema.safeParse(raw);
  if (r.success) return r.data;
  return { version: 2, sets: [] };
}

// Códigos de um item exigido (single = 1; grupo = alternativas).
export function requiredItemCodes(item: RequiredItem): string[] {
  return typeof item === 'string' ? [item] : item.anyOf;
}
export const isRequiredGroup = (item: RequiredItem): item is RequiredGroup => typeof item !== 'string';

// Códigos SINGLE exigidos pelo set DEFAULT (when:null) — usados pela checklist simples
// do hub. Grupos (anyOf) ficam para o editor rico (3d) e são preservados no save.
export function defaultRequiredCodes(raw: unknown): string[] {
  const def = parseDocumentRules(raw).sets.find((s) => s.when == null);
  return (def?.required ?? []).filter((r): r is string => typeof r === 'string');
}

// Atualiza os CÓDIGOS single do set default, PRESERVANDO grupos (anyOf) já no default
// e todos os sets condicionais (when != null).
export function upsertDefaultRequired(raw: unknown, requiredCodes: string[]): DocumentRules {
  const rules = parseDocumentRules(raw);
  const codes = Array.from(new Set(requiredCodes.filter(Boolean)));
  const others = rules.sets.filter((s) => s.when != null);
  const def = rules.sets.find((s) => s.when == null);
  const groups = (def?.required ?? []).filter(isRequiredGroup);
  const defaultSet: DocumentSet = { id: 'default', priority: 0, when: null, required: [...codes, ...groups] };
  return { version: 2, sets: [defaultSet, ...others] };
}

// --- Editor avançado (3d-2): grupos "um de N" no default + sets condicionais ---

// Grupos (anyOf) já presentes no set default.
export function defaultGroups(raw: unknown): RequiredGroup[] {
  const def = parseDocumentRules(raw).sets.find((s) => s.when == null);
  return (def?.required ?? []).filter(isRequiredGroup);
}

// Sets condicionais (when != null), ordenados por prioridade desc.
export function conditionalSets(raw: unknown): DocumentSet[] {
  return parseDocumentRules(raw)
    .sets.filter((s) => s.when != null)
    .sort((a, b) => b.priority - a.priority);
}

// Monta o document_rules final a partir das 3 fontes editadas na UI:
// checklist simples (defaultCodes) + grupos do default + sets condicionais.
export function buildDocumentRules(input: {
  defaultCodes: string[];
  defaultGroups: RequiredGroup[];
  conditionalSets: DocumentSet[];
}): DocumentRules {
  const codes = Array.from(new Set(input.defaultCodes.filter(Boolean)));
  const groups = input.defaultGroups.filter((g) => g.anyOf.length >= 1);
  const def: DocumentSet = { id: 'default', priority: 0, when: null, required: [...codes, ...groups] };
  // saneia sets condicionais: descarta os sem exigências ou sem condição.
  const conds = input.conditionalSets.filter(
    (s) => s.required.length > 0 && s.when != null && ((s.when.all?.length ?? 0) + (s.when.any?.length ?? 0) > 0),
  );
  return { version: 2, sets: [def, ...conds] };
}
