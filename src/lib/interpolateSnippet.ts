// Client-side snippet variable interpolation.
// Unknown variables collapse to empty string (never leave `{{var}}` in output).

export interface SnippetVars {
  nome_contato?: string | null;
  primeiro_nome?: string | null;
  empresa?: string | null;
  agente?: string | null;
  numero_comercial?: string | null;
  numero_atendimento?: string | null;
}

const SUPPORTED = new Set<keyof SnippetVars>([
  'nome_contato',
  'primeiro_nome',
  'empresa',
  'agente',
  'numero_comercial',
  'numero_atendimento',
]);

export function interpolateSnippet(body: string, vars: SnippetVars): string {
  return body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => {
    if (!SUPPORTED.has(key as keyof SnippetVars)) return '';
    const v = vars[key as keyof SnippetVars];
    return v == null ? '' : String(v);
  });
}

export function buildSnippetVars(input: {
  contactName?: string | null;
  companyName?: string | null;
  agentName?: string | null;
  commercialNumber?: string | null;
  serviceNumber?: string | null;
}): SnippetVars {
  const contactName = input.contactName?.trim() || '';
  const firstName = contactName ? contactName.split(/\s+/)[0] : '';
  return {
    nome_contato: contactName,
    primeiro_nome: firstName,
    empresa: input.companyName ?? '',
    agente: input.agentName ?? '',
    numero_comercial: input.commercialNumber ?? '',
    numero_atendimento: input.serviceNumber ?? '',
  };
}
