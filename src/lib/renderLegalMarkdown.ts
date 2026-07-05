import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/** Slugifica em ASCII com hífens, remove diacríticos e numeração de seção. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Remove numeração tipo "7. " ou "12.1. " no início do heading.
    .replace(/^\s*\d+(?:\.\d+)*\.?\s*/, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Renderiza markdown em HTML, injetando `id` slugificado nas <h2>.
 * Faz um passo pós-marked por regex — simples e determinístico. As h2 em
 * markdown ficam em `<h2>Texto</h2>`; extraímos o texto (removendo tags
 * inline), geramos o slug e devolvemos `<h2 id="slug">Texto</h2>`.
 */
export function renderLegalMarkdown(md: string): string {
  const stripped = md
    .replace(/^#\s+[^\n]*\n+/, "")
    .replace(/^\*\*(?:Última atualização|Last updated)[^*]+\*\*\s*\n+/im, "");

  const html = marked.parse(stripped) as string;

  return html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_m, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "");
    const id = slugify(text);
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });
}

/** Extrai a data de "Última atualização" / "Last updated" do início do markdown. */
export function extractUpdatedAt(md: string): string | undefined {
  const match = md.match(/\*\*(?:Última atualização|Last updated)[:：]\s*([^*]+)\*\*/i);
  return match?.[1]?.trim();
}
