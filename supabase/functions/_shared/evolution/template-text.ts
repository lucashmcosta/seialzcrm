// Texto de mensagem com botões enviada por outra empresa (boleto, lembrete etc.).
// O texto vem junto no payload do Baileys; antes caía em "[mensagem não suportada]".
// Testes em tests/evolution-template-text.test.ts.

// deno-lint-ignore no-explicit-any
const str = (v: any): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// deno-lint-ignore no-explicit-any
export function evolutionTemplateText(message: any): string | null {
  const tpl = message?.templateMessage;
  const interactive = tpl?.interactiveMessageTemplate ?? message?.interactiveMessage;
  const hydrated = tpl?.hydratedTemplate ?? tpl?.hydratedFourRowTemplate;
  const body = str(interactive?.body?.text) ?? str(hydrated?.hydratedContentText);
  if (!body) return null;
  const footer = str(interactive?.footer?.text) ?? str(hydrated?.hydratedFooterText);
  return footer ? `${body}\n\n${footer}` : body;
}
