// Pergunta com opções do agente (ferramenta send_choices): monta a mensagem interativa a
// partir do que o modelo mandou e evita que a pergunta saia duas vezes (texto + botões).
// Sem dependências de Deno, para os testes.

import { normalizeInteractive, validateInteractive, type InteractivePayload } from "../whatsapp-interactive.ts";

export const CHOICES_DEFAULT_BUTTON_TEXT = "Ver opções";
export const CHOICES_MIN = 2;
export const CHOICES_MAX = 10;

/** Até 3 opções viram botões; de 4 a 10, lista com uma seção. Devolve os problemas em português. */
export function buildChoicesInteractive(args: any): { payload: InteractivePayload | null; problems: string[] } {
  const question = typeof args?.question === "string" ? args.question.trim() : "";
  const options = Array.isArray(args?.options)
    ? args.options.map((o: unknown) => (typeof o === "string" ? o.trim() : "")).filter((o: string) => o.length > 0)
    : [];
  if (!question) return { payload: null, problems: ["Escreva a pergunta em question."] };
  if (options.length < CHOICES_MIN || options.length > CHOICES_MAX) {
    return { payload: null, problems: [`Use de ${CHOICES_MIN} a ${CHOICES_MAX} opções em options.`] };
  }
  const buttonText = typeof args?.button_text === "string" && args.button_text.trim()
    ? args.button_text.trim()
    : CHOICES_DEFAULT_BUTTON_TEXT;
  const raw: InteractivePayload = options.length <= 3
    ? { kind: "buttons", body: question, buttons: options.map((title: string) => ({ id: "", title })) }
    : { kind: "list", body: question, buttonText, sections: [{ rows: options.map((title: string) => ({ id: "", title })) }] };
  const payload = normalizeInteractive(raw);
  const problems = validateInteractive(payload);
  return problems.length ? { payload: null, problems } : { payload, problems: [] };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Tira do texto as mensagens que só repetem a pergunta que vai com os botões. */
export function withoutQuestionEcho(bubbles: string[], question: string | null | undefined): string[] {
  const q = norm(question ?? "");
  if (!q) return bubbles;
  return bubbles.filter((b) => norm(b) !== q);
}
