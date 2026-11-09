// Perfil de análise na tela. A regra de chave é a mesma do backend
// (_shared/intelligence/analysis-profile.ts); tests/analysis-profile-ui.test.ts cobra a paridade.
export type AnalysisProfileForm = {
  preset: 'juridico' | 'geral';
  business_description: string;
  objections: Array<{ key: string; label: string }>;
};

export const MAX_OBJECTIONS = 12;
const RESERVED = ['price', 'timing', 'authority', 'trust', 'fit', 'competitor', 'no_need', 'other'];

export function objectionKey(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

export function emptyProfile(raw: unknown): AnalysisProfileForm {
  const r = (raw ?? {}) as Partial<AnalysisProfileForm>;
  return {
    preset: r.preset === 'juridico' ? 'juridico' : 'geral',
    business_description: r.business_description ?? '',
    objections: Array.isArray(r.objections) ? r.objections : [],
  };
}

export function addObjection(objections: AnalysisProfileForm['objections'], rawLabel: string) {
  const label = rawLabel.replace(/\s+/g, ' ').trim().slice(0, 60);
  const key = objectionKey(label);
  if (!key || RESERVED.includes(key) || objections.length >= MAX_OBJECTIONS || objections.some((o) => o.key === key)) {
    return objections;
  }
  return [...objections, { key, label }];
}
