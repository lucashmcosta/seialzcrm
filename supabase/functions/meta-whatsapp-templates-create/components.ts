// Montagem de componentes UTILITY/MARKETING. Corpo de buildComponents movido sem alteração de index.ts.
export interface Variable { key: string; name: string; example: string }
export interface QuickReplyButton { id: string; title: string }

export interface CreateInput {
  organizationId: string;
  name: string;
  language: string;
  category: string;
  body: string;
  header?: string;
  footer?: string;
  variables?: Variable[];
  buttons?: QuickReplyButton[];
}

export function normalizeLang(l: string): string {
  return (l || "").replace("-", "_");
}

export function buildComponents(input: CreateInput) {
  const components: any[] = [];
  if (input.header && input.header.trim().length > 0) {
    components.push({ type: "HEADER", format: "TEXT", text: input.header.trim() });
  }
  const bodyComp: any = { type: "BODY", text: input.body };
  const vars = (input.variables || []).filter((v) => v && v.example !== undefined);
  const matches = Array.from(input.body.matchAll(/\{\{(\d+)\}\}/g))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n));
  const uniqueVarNums = Array.from(new Set(matches)).sort((a, b) => a - b);
  if (uniqueVarNums.length > 0) {
    const examples = uniqueVarNums.map((n) => {
      const v = vars.find((x) => String(x.key) === String(n));
      return (v?.example || `exemplo${n}`).slice(0, 60);
    });
    bodyComp.example = { body_text: [examples] };
  }
  components.push(bodyComp);
  if (input.footer && input.footer.trim().length > 0) {
    components.push({ type: "FOOTER", text: input.footer.trim() });
  }
  const buttons = (input.buttons || []).filter((b) => b && b.title && b.title.trim().length > 0);
  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.slice(0, 10).map((b) => ({
        type: "QUICK_REPLY",
        text: b.title.trim().slice(0, 25),
      })),
    });
  }
  return components;
}
