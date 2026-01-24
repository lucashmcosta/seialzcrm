/**
 * Centralized knowledge categories configuration
 * Backend/DB uses English keys, Frontend shows Portuguese labels
 */

export const KNOWLEDGE_CATEGORIES = {
  // Global categories
  general: { label: 'Sobre a Empresa', scope: 'global' as const },
  contact_hours: { label: 'Horários e Contato', scope: 'global' as const },
  payment: { label: 'Formas de Pagamento', scope: 'global' as const },
  policies: { label: 'Políticas', scope: 'global' as const },
  scope: { label: 'Escopo de Atuação', scope: 'global' as const },
  compliance: { label: 'Regras de Compliance', scope: 'global' as const },
  language_guide: { label: 'Guia de Linguagem', scope: 'global' as const },
  glossary: { label: 'Glossário de Termos', scope: 'global' as const },
  
  // Product categories
  product_service: { label: 'Descrição do Produto', scope: 'product' as const },
  pricing_plans: { label: 'Preços e Planos', scope: 'product' as const },
  process: { label: 'Processo e Etapas', scope: 'product' as const },
  requirements: { label: 'Requisitos', scope: 'product' as const },
  objections: { label: 'Objeções Comuns', scope: 'product' as const },
  qualification: { label: 'Qualificação', scope: 'product' as const },
  faq: { label: 'Perguntas Frequentes', scope: 'product' as const },
  social_proof: { label: 'Casos de Sucesso', scope: 'product' as const },
} as const;

export type KnowledgeCategory = keyof typeof KNOWLEDGE_CATEGORIES;

export const VALID_CATEGORIES = Object.keys(KNOWLEDGE_CATEGORIES) as KnowledgeCategory[];

export const GLOBAL_CATEGORIES: readonly string[] = Object.entries(KNOWLEDGE_CATEGORIES)
  .filter(([_, v]) => v.scope === 'global')
  .map(([k]) => k);

export const PRODUCT_CATEGORIES: readonly string[] = Object.entries(KNOWLEDGE_CATEGORIES)
  .filter(([_, v]) => v.scope === 'product')
  .map(([k]) => k);

export const CATEGORY_LABELS = Object.fromEntries(
  Object.entries(KNOWLEDGE_CATEGORIES).map(([k, v]) => [k, v.label])
) as Record<KnowledgeCategory, string>;

// For dropdowns with value/label pairs
export const CATEGORY_OPTIONS = Object.entries(KNOWLEDGE_CATEGORIES).map(([value, { label }]) => ({
  value,
  label,
}));

// Validate if a string is a valid category
export function isValidCategory(category: string): category is KnowledgeCategory {
  return VALID_CATEGORIES.includes(category as KnowledgeCategory);
}

// Get category label with fallback
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as KnowledgeCategory] || category;
}
