// Only presentation data: never persist button URLs, tokens or example values.
export type TemplateDisplay = {
  headerText?: string;
  footer?: string;
  buttons: Array<{ type: string; text: string }>;
};
export function templateDisplay(components: unknown): TemplateDisplay {
  const display: TemplateDisplay = { buttons: [] };
  if (!Array.isArray(components)) return display;
  for (const component of components) {
    if (!component || typeof component !== 'object') continue;
    const type = String(component.type).toUpperCase();
    if (type === 'HEADER' && component.format === 'TEXT' && typeof component.text === 'string' && !component.text.includes('{{')) display.headerText = component.text;
    if (type === 'FOOTER' && typeof component.text === 'string') display.footer = component.text;
    if (type === 'BUTTONS' && Array.isArray(component.buttons)) {
      // COPY_CODE criado por nós não tem texto (a Meta usa um rótulo fixo).
      display.buttons = component.buttons
        .filter((b: Record<string, unknown>) => b && (typeof b.text === 'string' || String(b.type).toUpperCase() === 'COPY_CODE'))
        .map((b: Record<string, unknown>) => ({ type: String(b.type || ''), text: typeof b.text === 'string' ? b.text : 'Copiar código' }));
    }
  }
  return display;
}
