// Escolhe a org em que o usuário entra quando ele tem mais de um vínculo ativo.
// Regra determinística (igual no login e no OrganizationContext):
// 1) org com onboarding concluído antes de org em onboarding;
// 2) depois, o vínculo mais antigo (data de entrada).
// Sem isso, `.maybeSingle()` falhava com 2+ vínculos e o login travava sem mensagem.
export type MembershipRow<O> = {
  created_at?: string | null;
  organization: (O & { onboarding_step?: string | null }) | null;
};

export function pickActiveMembership<O, T extends MembershipRow<O>>(rows: T[] | null | undefined): T | null {
  const valid = (rows ?? []).filter((r) => r.organization);
  if (valid.length === 0) return null;
  const done = (r: T) => (r.organization?.onboarding_step === 'completed' ? 0 : 1);
  const time = (r: T) => (r.created_at ? Date.parse(r.created_at) : Number.MAX_SAFE_INTEGER);
  return [...valid].sort((a, b) => done(a) - done(b) || time(a) - time(b))[0];
}
