import { sanitizeTemplateParam } from "./template-param-text.ts";

export type TemplateDefinition = {
  type: string; format?: string; text?: string;
  buttons?: { type: string; text: string; url?: string }[];
};
export type TemplateInput = {
  body?: Record<string, unknown>;
  headerImageUrl?: string;
  buttonUrls?: Record<string, string>;
};

export function httpsUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Informe uma URL HTTPS válida."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Informe uma URL HTTPS válida.");
  return value;
}

// Meta recebe somente o sufixo, nunca a URL completa, para um botão dinâmico.
export function urlButtonSuffix(pattern: string, value: string): string {
  httpsUrl(value);
  if (!pattern.endsWith("{{1}}") || pattern.split("{{").length !== 2) throw new Error("Formato de link dinâmico não suportado.");
  const prefix = pattern.slice(0, -5);
  httpsUrl(prefix);
  if (!value.startsWith(prefix) || value.length === prefix.length) throw new Error("O link não corresponde ao endereço aprovado no template.");
  const suffix = value.slice(prefix.length);
  if (/[\s{}]/.test(suffix)) throw new Error("Link de assinatura inválido.");
  return suffix;
}

export function buildMetaTemplateComponents(definition: TemplateDefinition[], input: TemplateInput, fallbackBody = "") {
  const body = definition.find(c => c.type.toUpperCase() === "BODY")?.text || fallbackBody;
  const keys = [...new Set((body.match(/\{\{(\d+)\}\}/g) ?? []).map(v => v.slice(2, -2)))].sort((a, b) => Number(a) - Number(b));
  const values = Object.fromEntries(keys.map(k => [k, sanitizeTemplateParam(input.body?.[k] ?? input.body?.[`var${k}`] ?? "")]));
  const components: Record<string, unknown>[] = [];
  const header = definition.find(c => c.type.toUpperCase() === "HEADER");
  if (header?.format?.toUpperCase() === "IMAGE") {
    if (!input.headerImageUrl) throw new Error("Informe a imagem do cabeçalho do template.");
    components.push({ type: "header", parameters: [{ type: "image", image: { link: httpsUrl(input.headerImageUrl) } }] });
  } else if (header?.format && header.format.toUpperCase() !== "TEXT") {
    throw new Error("Este formato de cabeçalho ainda não é suportado neste envio.");
  } else if (header?.text?.includes("{{")) {
    throw new Error("Este template exige variáveis no cabeçalho.");
  }
  if (keys.length) components.push({ type: "body", parameters: keys.map(k => ({ type: "text", text: values[k] })) });
  const buttons = definition.find(c => c.type.toUpperCase() === "BUTTONS")?.buttons ?? [];
  buttons.forEach((button, index) => {
    if (button.type.toUpperCase() !== "URL" || !button.url?.includes("{{")) return;
    const url = input.buttonUrls?.[String(index)];
    if (!url) throw new Error(`Informe o link do botão ${button.text}.`);
    components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: urlButtonSuffix(button.url, url) }] });
  });
  return { components, preview: body.replace(/\{\{(\d+)\}\}/g, (match, key) => values[key] || match) };
}

// Somente modelos que podem ser preenchidos integralmente pelo fluxo de assinatura.
export function signatureTemplateButton(definition: TemplateDefinition[]): { index: number; text: string; url: string; hasImage: boolean } | null {
  const body = definition.find(c => c.type.toUpperCase() === "BODY");
  const header = definition.find(c => c.type.toUpperCase() === "HEADER");
  if (!body?.text || body.text.includes("{{")) return null;
  if (header && (header.text?.includes("{{") || !["TEXT", "IMAGE"].includes(header.format?.toUpperCase() ?? ""))) return null;
  if (definition.some(c => !["BODY", "HEADER", "FOOTER", "BUTTONS"].includes(c.type.toUpperCase()))) return null;
  const buttons = definition.find(c => c.type.toUpperCase() === "BUTTONS")?.buttons ?? [];
  // Um botão apenas evita botões adicionais que exijam parâmetros não mapeados.
  if (buttons.length !== 1) return null;
  const button = buttons[0];
  if (button.type.toUpperCase() !== "URL" || button.url !== "https://sign.suvsign.com/s/{{1}}") return null;
  return { index: 0, text: button.text, url: button.url, hasImage: header?.format?.toUpperCase() === "IMAGE" };
}

export function redactTemplateComponents(components: Record<string, unknown>[]) {
  return components.map(c => c.type === "button" ? { ...c, parameters: [{ type: "text", text: "[link protegido]" }] } : c);
}
