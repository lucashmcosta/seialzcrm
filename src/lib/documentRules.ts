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

export const WhenSchema = z.object({ all: z.array(WhenConditionSchema).default([]) }).nullable();

export const DocumentSetSchema = z.object({
  id: z.string().min(1),
  priority: z.number().int().default(0),
  when: WhenSchema.default(null),
  required: z.array(z.string()).default([]),  // CÓDIGOS de document_type
});

export const DocumentRulesSchema = z.object({
  version: z.number().int().default(2),
  sets: z.array(DocumentSetSchema).default([]),
});

export type DocumentRules = z.infer<typeof DocumentRulesSchema>;
export type DocumentSet = z.infer<typeof DocumentSetSchema>;

// Parse tolerante: aceita o shape v2; legado {version:1, rules:[]} vira sets vazio.
export function parseDocumentRules(raw: unknown): DocumentRules {
  const r = DocumentRulesSchema.safeParse(raw);
  if (r.success) return r.data;
  return { version: 2, sets: [] };
}

// Códigos exigidos pelo set DEFAULT (when:null).
export function defaultRequiredCodes(raw: unknown): string[] {
  const def = parseDocumentRules(raw).sets.find((s) => s.when == null);
  return def?.required ?? [];
}

// Atualiza SÓ o set default preservando eventuais sets condicionais (futuro/3d).
export function upsertDefaultRequired(raw: unknown, requiredCodes: string[]): DocumentRules {
  const codes = Array.from(new Set(requiredCodes.filter(Boolean)));
  const others = parseDocumentRules(raw).sets.filter((s) => s.when != null);
  const defaultSet: DocumentSet = { id: 'default', priority: 0, when: null, required: codes };
  return { version: 2, sets: [defaultSet, ...others] };
}
