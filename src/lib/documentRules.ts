import { z } from 'zod';

// Regras de documento exigidas para fechar (won) uma oportunidade. Moram em
// opportunity_close_policies.document_rules (JSON). `when` reservado para condições futuras
// (field/operator/value, all/any) — hoje sempre null (=> sempre exigido). Avaliado server-side
// no evaluate_opportunity_close_internal_v1 (guard canônico do WON).
export const DocumentRuleSchema = z.object({
  document_type_id: z.string().uuid(),
  effect: z.literal('require').default('require'),
  when: z.null().default(null),
});

export const DocumentRulesSchema = z.object({
  version: z.number().int().default(1),
  rules: z.array(DocumentRuleSchema).default([]),
});

export type DocumentRules = z.infer<typeof DocumentRulesSchema>;

export function parseDocumentRules(raw: unknown): DocumentRules {
  const r = DocumentRulesSchema.safeParse(raw);
  return r.success ? r.data : { version: 1, rules: [] };
}

export function requiredTypeIds(raw: unknown): string[] {
  return parseDocumentRules(raw)
    .rules.filter((r) => r.effect === 'require')
    .map((r) => r.document_type_id);
}

export function buildDocumentRules(typeIds: string[]): DocumentRules {
  const seen = new Set<string>();
  const rules: DocumentRules['rules'] = typeIds
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => ({ document_type_id: id, effect: 'require' as const, when: null as never }));
  return { version: 1, rules };
}
