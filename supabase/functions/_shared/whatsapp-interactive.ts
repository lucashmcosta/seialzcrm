// Mensagens interativas do WhatsApp (botões, lista e botão de link), independentes de provedor.
// Uma única fonte de regras para o servidor e para a tela: limites da Meta, conversão para a
// Cloud API e texto numerado para provedores sem botões (Twilio, Evolution).
// Sem dependências de Deno: também é importado pelo frontend.

export type InteractiveButton = { id: string; title: string };
export type InteractiveRow = { id: string; title: string; description?: string };
export type InteractiveSection = { title?: string; rows: InteractiveRow[] };

/** Mídia no topo (só botões e link; a Meta não aceita em lista). Enviada por link público. */
export type InteractiveHeaderMedia = { type: "image" | "video" | "document"; url: string; filename?: string };

type Common = { body: string; header?: string; headerMedia?: InteractiveHeaderMedia; footer?: string };

export type InteractivePayload =
  | (Common & { kind: "buttons"; buttons: InteractiveButton[] })
  | (Common & { kind: "list"; buttonText: string; sections: InteractiveSection[] })
  | (Common & { kind: "cta_url"; displayText: string; url: string });

/** Limites da Cloud API (mensagens interativas de sessão). */
export const INTERACTIVE_LIMITS = {
  body: 1024,
  header: 60,
  footer: 60,
  buttonsMax: 3,
  buttonTitle: 20,
  listRowsMax: 10,
  listSectionsMax: 10,
  rowTitle: 24,
  rowDescription: 72,
  sectionTitle: 24,
  listButtonText: 20,
  ctaDisplayText: 20,
  id: 256,
} as const;

const len = (s: string | undefined | null) => [...(s ?? "")].length;
const clean = (s: string | undefined | null) => (s ?? "").trim();

/** Id estável a partir do título, para quem não informa um id. */
export function slugId(title: string, index: number): string {
  const base = clean(title).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return base ? `${base}` : `opcao_${index + 1}`;
}

/** Preenche ids ausentes e corta espaços. Não altera limites: isso é papel de validate. */
export function normalizeInteractive(p: InteractivePayload): InteractivePayload {
  const media = p.headerMedia
    ? { type: p.headerMedia.type, url: clean(p.headerMedia.url), ...(clean(p.headerMedia.filename) ? { filename: clean(p.headerMedia.filename) } : {}) }
    : undefined;
  const headerText = media ? "" : clean(p.header);
  const keepMedia = p.kind !== "list" ? media : undefined;
  const common = {
    body: clean(p.body),
    // Com mídia no topo não há título em texto. Campos vazios ficam de fora.
    ...(headerText ? { header: headerText } : {}),
    ...(keepMedia ? { headerMedia: keepMedia } : {}),
    ...(clean(p.footer) ? { footer: clean(p.footer) } : {}),
  };
  const uniq = (items: { id?: string; title: string }[]) => {
    const seen = new Set<string>();
    return items.map((it, i) => {
      let id = clean(it.id) || slugId(it.title, i);
      while (seen.has(id)) id = `${id}_${i + 1}`;
      seen.add(id);
      return id;
    });
  };
  if (p.kind === "buttons") {
    const ids = uniq(p.buttons);
    return { ...common, kind: "buttons", buttons: p.buttons.map((b, i) => ({ id: ids[i], title: clean(b.title) })) };
  }
  if (p.kind === "list") {
    const flat = p.sections.flatMap((s) => s.rows);
    const ids = uniq(flat);
    let k = 0;
    return {
      ...common, kind: "list", buttonText: clean(p.buttonText),
      sections: p.sections.map((s) => ({
        title: clean(s.title) || undefined,
        rows: s.rows.map((r) => ({ id: ids[k++], title: clean(r.title), description: clean(r.description) || undefined })),
      })),
    };
  }
  return { ...common, kind: "cta_url", displayText: clean(p.displayText), url: clean(p.url) };
}

/** Lista de problemas em português (vazia = válido). */
export function validateInteractive(p: InteractivePayload | null | undefined): string[] {
  const L = INTERACTIVE_LIMITS;
  const e: string[] = [];
  if (!p || typeof p !== "object") return ["Mensagem interativa ausente."];
  if (!clean(p.body)) e.push("Escreva o texto da mensagem.");
  if (len(p.body) > L.body) e.push(`O texto passa de ${L.body} caracteres.`);
  if (len(p.header) > L.header) e.push(`O título passa de ${L.header} caracteres.`);
  if (len(p.footer) > L.footer) e.push(`O rodapé passa de ${L.footer} caracteres.`);
  if (p.headerMedia) {
    if (p.kind === "list") e.push("Lista não aceita imagem, vídeo ou PDF no topo.");
    if (!["image", "video", "document"].includes(p.headerMedia.type)) e.push("Tipo de mídia do topo inválido.");
    if (!clean(p.headerMedia.url)) e.push("Escolha o arquivo de imagem, vídeo ou PDF do topo.");
    else if (!/^https:\/\/\S+$/i.test(clean(p.headerMedia.url))) e.push("A mídia do topo precisa de um link https.");
    if (clean(p.header)) e.push("Use título em texto ou mídia no topo, não os dois.");
  }
  if (p.kind === "buttons") {
    const bs = Array.isArray(p.buttons) ? p.buttons : [];
    if (bs.length < 1 || bs.length > L.buttonsMax) e.push(`Use de 1 a ${L.buttonsMax} botões.`);
    const titles = new Set<string>();
    bs.forEach((b, i) => {
      if (!clean(b?.title)) e.push(`O botão ${i + 1} está sem texto.`);
      if (len(b?.title) > L.buttonTitle) e.push(`O botão ${i + 1} passa de ${L.buttonTitle} caracteres.`);
      if (len(b?.id) > L.id) e.push(`O código do botão ${i + 1} é longo demais.`);
      const t = clean(b?.title).toLowerCase();
      if (t && titles.has(t)) e.push("Dois botões têm o mesmo texto.");
      titles.add(t);
    });
  } else if (p.kind === "list") {
    const ss = Array.isArray(p.sections) ? p.sections : [];
    const rows = ss.flatMap((s) => (Array.isArray(s?.rows) ? s.rows : []));
    if (!clean(p.buttonText)) e.push("Escreva o texto do botão que abre a lista.");
    if (len(p.buttonText) > L.listButtonText) e.push(`O texto do botão da lista passa de ${L.listButtonText} caracteres.`);
    if (ss.length < 1 || ss.length > L.listSectionsMax) e.push(`Use de 1 a ${L.listSectionsMax} seções.`);
    if (ss.length > 1 && ss.some((s) => !clean(s?.title))) e.push("Com mais de uma seção, todas precisam de título.");
    ss.forEach((s, i) => {
      if (len(s?.title) > L.sectionTitle) e.push(`O título da seção ${i + 1} passa de ${L.sectionTitle} caracteres.`);
      if (!s?.rows?.length) e.push(`A seção ${i + 1} está sem opções.`);
    });
    if (rows.length < 1 || rows.length > L.listRowsMax) e.push(`Use de 1 a ${L.listRowsMax} opções na lista.`);
    const titles = new Set<string>();
    rows.forEach((r, i) => {
      if (!clean(r?.title)) e.push(`A opção ${i + 1} está sem texto.`);
      if (len(r?.title) > L.rowTitle) e.push(`A opção ${i + 1} passa de ${L.rowTitle} caracteres.`);
      if (len(r?.description) > L.rowDescription) e.push(`A descrição da opção ${i + 1} passa de ${L.rowDescription} caracteres.`);
      if (len(r?.id) > L.id) e.push(`O código da opção ${i + 1} é longo demais.`);
      const t = clean(r?.title).toLowerCase();
      if (t && titles.has(t)) e.push("Duas opções têm o mesmo texto.");
      titles.add(t);
    });
  } else if (p.kind === "cta_url") {
    if (!clean(p.displayText)) e.push("Escreva o texto do botão do link.");
    if (len(p.displayText) > L.ctaDisplayText) e.push(`O texto do botão do link passa de ${L.ctaDisplayText} caracteres.`);
    if (!/^https?:\/\/\S+\.\S+/i.test(clean(p.url))) e.push("O link precisa começar com http:// ou https://.");
  } else {
    e.push("Tipo de mensagem interativa desconhecido.");
  }
  return e;
}

/** Corpo do campo `interactive` da Cloud API. */
export function toMetaInteractive(p: InteractivePayload): Record<string, unknown> {
  const m = p.headerMedia;
  const header = m
    ? { header: m.type === "document"
        ? { type: "document", document: { link: m.url, ...(m.filename ? { filename: m.filename } : {}) } }
        : { type: m.type, [m.type]: { link: m.url } } }
    : p.header ? { header: { type: "text", text: p.header } } : {};
  const footer = p.footer ? { footer: { text: p.footer } } : {};
  const body = { body: { text: p.body } };
  if (p.kind === "buttons") {
    return {
      type: "button", ...header, ...body, ...footer,
      action: { buttons: p.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
    };
  }
  if (p.kind === "list") {
    return {
      type: "list", ...header, ...body, ...footer,
      action: {
        button: p.buttonText,
        sections: p.sections.map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })),
        })),
      },
    };
  }
  return {
    type: "cta_url", ...header, ...body, ...footer,
    action: { name: "cta_url", parameters: { display_text: p.displayText, url: p.url } },
  };
}

/** Opções na ordem em que aparecem (botões ou linhas da lista). */
export function interactiveOptions(p: InteractivePayload): InteractiveRow[] {
  if (p.kind === "buttons") return p.buttons.map((b) => ({ id: b.id, title: b.title }));
  if (p.kind === "list") return p.sections.flatMap((s) => s.rows);
  return [];
}

/** Texto equivalente, para provedores sem botões e para o campo `content` da mensagem. */
export function interactiveFallbackText(p: InteractivePayload): string {
  const parts: string[] = [];
  if (p.header) parts.push(`*${p.header}*`);
  parts.push(p.body);
  if (p.kind === "cta_url") {
    parts.push(`${p.displayText}: ${p.url}`);
  } else {
    const opts = interactiveOptions(p);
    parts.push(opts.map((o, i) => `${i + 1}. ${o.title}${o.description ? ` (${o.description})` : ""}`).join("\n"));
    parts.push(opts.length === 1 ? "Responda com 1." : `Responda com o número da opção (1 a ${opts.length}).`);
  }
  if (p.footer) parts.push(`_${p.footer}_`);
  return parts.join("\n\n");
}

/** Resposta da cliente a uma mensagem interativa, já reduzida a id + título. */
export type InteractiveReply = { kind: "button" | "list" | "template_button" | "flow"; id: string | null; title: string | null };

/** Extrai a escolha de uma mensagem recebida da Cloud API (botão, lista, botão de modelo). */
export function metaInboundInteractiveReply(msg: any): InteractiveReply | null {
  if (!msg || typeof msg !== "object") return null;
  if (msg.type === "button" && msg.button) {
    return { kind: "template_button", id: msg.button.payload ?? null, title: msg.button.text ?? null };
  }
  const it = msg.interactive;
  if (msg.type === "interactive" && it) {
    if (it.button_reply) return { kind: "button", id: it.button_reply.id ?? null, title: it.button_reply.title ?? null };
    if (it.list_reply) return { kind: "list", id: it.list_reply.id ?? null, title: it.list_reply.title ?? null };
    if (it.nfm_reply) return { kind: "flow", id: it.nfm_reply.name ?? null, title: null };
  }
  return null;
}

/**
 * Casa uma resposta digitada ("2", "opção 2", ou o próprio texto da opção) com as opções
 * da última mensagem interativa. Útil no texto numerado (Twilio/Evolution).
 */
export function matchTypedReply(text: string, p: InteractivePayload): InteractiveRow | null {
  const opts = interactiveOptions(p);
  if (!opts.length) return null;
  const t = clean(text).toLowerCase();
  const num = t.match(/^(?:op[cç][aã]o\s*)?(\d{1,2})[.)]?$/);
  if (num) {
    const i = Number(num[1]) - 1;
    return opts[i] ?? null;
  }
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return opts.find((o) => norm(o.title) === norm(t)) ?? null;
}
