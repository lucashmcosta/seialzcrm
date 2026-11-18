// O que o agente de IA pode escrever no log: estrutura, nunca conteúdo.
// Argumento de ferramenta e mensagem do cliente trazem nome, telefone, e-mail e
// o que a pessoa contou; no log entram só os nomes dos campos e os tamanhos.

/** Nomes dos campos que a ferramenta recebeu, sem os valores. */
export function toolArgKeys(args: unknown): string[] {
  return args && typeof args === "object" && !Array.isArray(args) ? Object.keys(args as Record<string, unknown>).sort() : [];
}

/** Resumo de uma resposta vazia do modelo, sem o texto dela. */
export function emptyResponseShape(message: unknown): Record<string, unknown> {
  const m = (message && typeof message === "object" ? message : {}) as Record<string, unknown>;
  const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
  return {
    role: typeof m.role === "string" ? m.role : null,
    has_content: typeof m.content === "string" && m.content.length > 0,
    has_refusal: !!m.refusal,
    tool_calls: calls.map((c) => {
      const fn = (c && typeof c === "object" ? (c as Record<string, unknown>).function : null) as Record<string, unknown> | null;
      return typeof fn?.name === "string" ? fn.name : "?";
    }),
  };
}

/** Provedor, como está em provider_pricing, a partir da integração usada. */
export function providerForIntegration(slug: string | null | undefined): string | null {
  if (slug === "claude-ai") return "anthropic";
  if (slug === "openai-gpt") return "openai";
  return null;
}
