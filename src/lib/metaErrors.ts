// Mapeia erros conhecidos da Graph API / edge functions para estados legíveis.
// A UX final NÃO deve mostrar JSON bruto da Graph — usa `title`/`detail`; o `technical`
// (mensagem/código crus) fica reservado para Logs/Developer (admin).

export interface MetaErrorState {
  kind: 'token' | 'permission' | 'rate_limit' | 'config' | 'not_found' | 'transient' | 'unknown';
  title: string;   // rótulo curto p/ badge/status
  detail: string;  // frase legível p/ o usuário
  action?: string; // sugestão de ação
  technical: string; // cru — só p/ admin em Logs/Developer
}

interface RawLike {
  code?: number;
  error_subcode?: number;
  message?: string;
  status?: number;
}

function extract(err: unknown): RawLike {
  const e = (err ?? {}) as Record<string, unknown>;
  const ctx = e.context as Record<string, unknown> | undefined;
  const g = (e.error ?? ctx?.error ?? e) as Record<string, unknown>;
  return {
    code: (g?.code ?? e.code) as number | undefined,
    error_subcode: g?.error_subcode as number | undefined,
    message: (g?.message ?? e.message ?? (typeof err === 'string' ? err : '')) as string,
    status: (e.status ?? e.statusCode) as number | undefined,
  };
}

// Códigos conhecidos da Graph API (Meta).
export function mapMetaError(err: unknown): MetaErrorState {
  const r = extract(err);
  const technical = `${r.code ? `#${r.code}${r.error_subcode ? `/${r.error_subcode}` : ''} ` : ''}${r.message ?? ''}`.trim() || 'Erro desconhecido';
  const code = r.code ?? 0;
  const msg = (r.message ?? '').toLowerCase();

  // Token inválido/expirado
  if ([190, 102, 463, 467, 460].includes(code) || msg.includes('access token')) {
    return { kind: 'token', title: 'Reconexão necessária', detail: 'A autorização com a Meta expirou ou foi revogada.', action: 'Reconecte a Meta na aba Conexão.', technical };
  }
  // Permissão faltando
  if (code === 200 || code === 10 || (code >= 3 && code <= 33 && msg.includes('permission')) || msg.includes('permission')) {
    return { kind: 'permission', title: 'Permissão insuficiente', detail: 'A conta Meta não tem a permissão necessária para esta ação.', action: 'Revise os escopos/ativos concedidos.', technical };
  }
  // Rate limit / uso da aplicação
  if ([4, 17, 32, 613, 80000, 80003, 80004].includes(code) || r.status === 429) {
    return { kind: 'rate_limit', title: 'Limite temporário', detail: 'A Meta está limitando as requisições no momento.', action: 'Tente novamente em alguns minutos.', technical };
  }
  // Config/param inválido (ex.: pixel/dataset, métrica inválida)
  if (code === 100) {
    return { kind: 'config', title: 'Configuração inválida', detail: 'Um parâmetro (ex.: Pixel/Dataset ou campo) é inválido ou indisponível.', action: 'Confira a configuração da capability.', technical };
  }
  if (code === 803 || msg.includes('does not exist') || msg.includes('nonexisting')) {
    return { kind: 'not_found', title: 'Recurso não encontrado', detail: 'O objeto solicitado não existe mais ou não é acessível.', technical };
  }
  if ((r.status ?? 0) >= 500 || code === 1 || code === 2) {
    return { kind: 'transient', title: 'Instabilidade temporária', detail: 'A Meta retornou um erro temporário.', action: 'Tente novamente.', technical };
  }
  return { kind: 'unknown', title: 'Falha na Meta', detail: 'Não foi possível completar a operação com a Meta.', technical };
}
