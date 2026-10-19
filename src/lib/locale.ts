export type AppLocale = 'pt-BR' | 'en-US';
export function resolveLocale(user?: string | null, organization?: string | null): AppLocale {
  if (user === 'en-US' || user === 'pt-BR') return user;
  return organization === 'en-US' ? 'en-US' : 'pt-BR';
}
export function profileName(fullName: string, firstName: string, lastName: string) {
  const full = fullName.trim() || [firstName, lastName].filter(Boolean).join(' ').trim();
  const [first = '', ...rest] = full.split(/\s+/);
  return { full_name: full, first_name: first || null, last_name: rest.join(' ') || null };
}
