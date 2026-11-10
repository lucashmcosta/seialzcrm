// Montagem e validação de componentes UTILITY/MARKETING (funções puras, testadas em components_test.ts).
export interface Variable { key: string; name: string; example: string }
export interface QuickReplyButton { id: string; title: string }
export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type MediaHeaderFormat = Exclude<HeaderFormat, "TEXT">;
export interface CtaAction {
  type: "url" | "phone" | "copy_code";
  title?: string;
  value: string;
  /** Somente URL dinâmica: valor de exemplo para o {{1}} do final do link. */
  example?: string;
}

export interface CreateInput {
  organizationId: string;
  name: string;
  language: string;
  category: string;
  body: string;
  header?: string;
  /** Exemplo do {{1}} do cabeçalho de texto. */
  headerExample?: string;
  /** Ausente = TEXT (comportamento anterior). */
  headerFormat?: HeaderFormat;
  /** URL pública (storage da org) do arquivo de exemplo do cabeçalho de mídia. */
  headerMediaUrl?: string;
  footer?: string;
  variables?: Variable[];
  buttons?: QuickReplyButton[];
  actions?: CtaAction[];
}

export const MEDIA_LIMITS: Record<MediaHeaderFormat, { types: string[]; maxBytes: number; label: string }> = {
  IMAGE: { types: ["image/jpeg", "image/png"], maxBytes: 5 * 1024 * 1024, label: "imagem JPG ou PNG de até 5 MB" },
  VIDEO: { types: ["video/mp4"], maxBytes: 16 * 1024 * 1024, label: "vídeo MP4 de até 16 MB" },
  DOCUMENT: { types: ["application/pdf"], maxBytes: 100 * 1024 * 1024, label: "documento PDF de até 100 MB" },
};

export function normalizeLang(l: string): string {
  return (l || "").replace("-", "_");
}

export function headerFormatOf(input: CreateInput): HeaderFormat {
  const f = String(input.headerFormat || "TEXT").toUpperCase();
  return (["TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(f) ? f : "TEXT") as HeaderFormat;
}

export function isMediaHeader(input: CreateInput): boolean {
  return headerFormatOf(input) !== "TEXT";
}

function quickReplies(input: CreateInput) {
  return (input.buttons || []).filter((b) => b && b.title && b.title.trim().length > 0);
}
function ctaActions(input: CreateInput) {
  return (input.actions || []).filter((a) => a && typeof a.type === "string");
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Retorna a primeira violação das regras da Meta (mensagem em português) ou null. */
export function validateTemplateInput(input: CreateInput): string | null {
  const format = headerFormatOf(input);
  if (input.headerFormat && String(input.headerFormat).toUpperCase() !== format) {
    return "Formato de cabeçalho inválido.";
  }
  if (format === "TEXT") {
    const header = (input.header || "").trim();
    if (header.length > 60) return "O cabeçalho deve ter no máximo 60 caracteres.";
    const vars = header.match(/\{\{[^}]*\}\}/g) ?? [];
    if (vars.length > 1 || vars.some((v) => v !== "{{1}}")) {
      return "O cabeçalho aceita no máximo uma variável, {{1}}.";
    }
    if (vars.length === 1 && !(input.headerExample || "").trim()) {
      return "Informe um exemplo para a variável do cabeçalho.";
    }
  } else if (!(input.headerMediaUrl || "").trim()) {
    return "Envie o arquivo de exemplo do cabeçalho.";
  }

  const qr = quickReplies(input);
  const ctas = ctaActions(input);
  if (qr.length + ctas.length > 10) return "O template aceita no máximo 10 botões.";
  for (const b of qr) {
    if (b.title.trim().length > 25) return `O botão "${b.title.trim()}" passa de 25 caracteres.`;
  }
  let urls = 0, phones = 0, codes = 0;
  for (const a of ctas) {
    const title = (a.title || "").trim();
    const value = (a.value || "").trim();
    if (a.type === "url") {
      urls++;
      if (!title) return "Informe o texto do botão de link.";
      if (title.length > 25) return `O botão "${title}" passa de 25 caracteres.`;
      if (!value || !isHttpUrl(value.replace("{{1}}", "x"))) return `Informe um link válido para o botão "${title}".`;
      if (value.length > 2000) return `O link do botão "${title}" passa de 2000 caracteres.`;
      const vars = value.match(/\{\{[^}]*\}\}/g) ?? [];
      if (vars.length > 1 || (vars.length === 1 && (vars[0] !== "{{1}}" || !value.endsWith("{{1}}")))) {
        return `O link do botão "${title}" só aceita a variável {{1}} no final.`;
      }
      if (vars.length === 1) {
        const ex = (a.example || "").trim();
        if (!ex) return `Informe um exemplo para a variável do link do botão "${title}".`;
        if (/[\s{}]/.test(ex)) return `O exemplo do link do botão "${title}" não pode ter espaços ou chaves.`;
      }
    } else if (a.type === "phone") {
      phones++;
      if (!title) return "Informe o texto do botão de telefone.";
      if (title.length > 25) return `O botão "${title}" passa de 25 caracteres.`;
      const digits = value.replace(/\D/g, "");
      if (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 8 || digits.length > 20) {
        return `Informe um telefone válido, com código do país, para o botão "${title}".`;
      }
    } else if (a.type === "copy_code") {
      codes++;
      if (!value) return "Informe o código de exemplo do botão de copiar código.";
      if (value.length > 15) return "O código de exemplo deve ter no máximo 15 caracteres.";
      if (!/^[A-Za-z0-9]+$/.test(value)) return "O código de exemplo deve ter só letras e números.";
    } else {
      return "Tipo de botão não suportado.";
    }
  }
  if (urls > 2) return "O template aceita no máximo 2 botões de link.";
  if (phones > 1) return "O template aceita no máximo 1 botão de telefone.";
  if (codes > 1) return "O template aceita no máximo 1 botão de copiar código.";
  return null;
}

function ctaButton(a: CtaAction): Record<string, unknown> {
  const text = (a.title || "").trim();
  const value = (a.value || "").trim();
  if (a.type === "url") {
    const button: Record<string, unknown> = { type: "URL", text, url: value };
    // Meta espera o link completo de exemplo (prefixo + valor do {{1}}).
    if (value.endsWith("{{1}}")) button.example = [value.slice(0, -5) + (a.example || "").trim()];
    return button;
  }
  if (a.type === "phone") return { type: "PHONE_NUMBER", text, phone_number: value.replace(/\D/g, "") };
  return { type: "COPY_CODE", example: value };
}

/**
 * Monta os componentes. `headerHandle` é obrigatório quando o cabeçalho é de mídia
 * (vem do Resumable Upload). Respostas rápidas vêm antes dos botões de ação,
 * preservando a ordem relativa — a Meta exige os dois grupos contíguos.
 */
export function buildComponents(input: CreateInput, headerHandle?: string) {
  const components: any[] = [];
  const format = headerFormatOf(input);
  if (format !== "TEXT") {
    if (!headerHandle) throw new Error("Arquivo de exemplo do cabeçalho não enviado à Meta.");
    components.push({ type: "HEADER", format, example: { header_handle: [headerHandle] } });
  } else if (input.header && input.header.trim().length > 0) {
    const text = input.header.trim();
    const header: any = { type: "HEADER", format: "TEXT", text };
    if (text.includes("{{1}}")) header.example = { header_text: [(input.headerExample || "").trim().slice(0, 60)] };
    components.push(header);
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
  const buttons = [
    ...quickReplies(input).map((b) => ({ type: "QUICK_REPLY", text: b.title.trim().slice(0, 25) })),
    ...ctaActions(input).map(ctaButton),
  ];
  if (buttons.length > 0) {
    components.push({ type: "BUTTONS", buttons: buttons.slice(0, 10) });
  }
  return components;
}

/** template_type local (constraint whatsapp_templates_template_type_check). */
export function localTemplateType(input: CreateInput): string {
  if (isMediaHeader(input)) return "media";
  if (ctaActions(input).length > 0) return "call-to-action";
  if (quickReplies(input).length > 0) return "quick-reply";
  return "text";
}

/**
 * O exemplo precisa estar no storage público da própria org (bucket whatsapp-media,
 * pasta {organizationId}/) — evita a função baixar URLs arbitrárias.
 */
export function isAllowedSampleUrl(url: string, supabaseUrl: string, organizationId: string): boolean {
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    if (u.protocol !== "https:" || u.origin !== base.origin || u.username || u.password) return false;
    const prefix = `/storage/v1/object/public/whatsapp-media/${organizationId}/`;
    const rest = u.pathname.slice(prefix.length);
    return !!organizationId && u.pathname.startsWith(prefix) && rest.length > 0 && !rest.includes("..");
  } catch {
    return false;
  }
}

/** Valida tipo/tamanho do arquivo baixado. Retorna mensagem de erro ou null. */
export function validateSampleMedia(format: MediaHeaderFormat, contentType: string, size: number): string | null {
  const spec = MEDIA_LIMITS[format];
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  if (!spec.types.includes(type)) return `O arquivo do cabeçalho deve ser ${spec.label}.`;
  if (size <= 0) return "O arquivo do cabeçalho está vazio.";
  if (size > spec.maxBytes) return `O arquivo do cabeçalho deve ser ${spec.label}.`;
  return null;
}

/** Tipo pelo nome do arquivo quando o storage devolve application/octet-stream. */
export function guessMimeFromUrl(url: string): string | null {
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", pdf: "application/pdf" } as Record<string, string>)[ext] ?? null;
}

/** Nome do arquivo (último segmento do caminho) para o cabeçalho de documento. */
export function fileNameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    // O formulário grava "{timestamp}-{nome original}"; o prefixo não vai para o cliente.
    return last.replace(/^\d{10,}-/, "") || "documento.pdf";
  } catch {
    return "documento.pdf";
  }
}
