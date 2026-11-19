// Link de audiência/perícia digitado à mão no sistema do escritório.
// Chega com espaço no meio ("…/j/123? pwd=abc"), com ID e senha da reunião colados
// depois do link, ou com dois links ("… ou https://…"). Daqui sai o link que abre
// e, à parte, o texto que veio junto.
// Mesma regra em src/lib/meetingLink.ts (navegador). Mudou aqui, mude lá.

export interface MeetingLink {
  url: string | null;
  extra: string | null;
}

const ENDS_JOINABLE = /[?&=/]$/;
const STARTS_JOINABLE = /^[/?&=]/;
const LOOKS_LIKE_HOST_OR_PATH = /\/|^[a-z0-9-]+\.[a-z]/i;

function shouldJoin(current: string, next: string): boolean {
  if (/^https?:\/\//i.test(next)) return false;
  if (ENDS_JOINABLE.test(current) || STARTS_JOINABLE.test(next)) return true;
  // "trt2-jus-br. zoom.us/j/…": espaço depois do ponto, ainda no endereço do site.
  return current.endsWith(".") && !current.includes("?") && LOOKS_LIKE_HOST_OR_PATH.test(next);
}

export function splitMeetingLink(raw: string | null | undefined): MeetingLink {
  const text = (raw ?? "").trim();
  if (!text) return { url: null, extra: null };
  const start = text.search(/https?:\/\//i);
  if (start < 0) return { url: null, extra: text };

  const before = text.slice(0, start).trim();
  const tokens = text.slice(start).split(/\s+/);
  let url = tokens[0];
  let i = 1;
  while (i < tokens.length && shouldJoin(url, tokens[i])) {
    url += tokens[i];
    i++;
  }
  url = url.replace(/[.,;:)]+$/, "");
  const extra = [before, tokens.slice(i).join(" ")].filter(Boolean).join(" ").trim() || null;

  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { url: null, extra: text };
    return { url: u.toString(), extra };
  } catch {
    return { url: null, extra: text };
  }
}

/** Link pronto para mandar ao cliente, com o ID/senha que vieram junto entre parênteses. */
export function meetingLinkText(raw: string | null | undefined): string | null {
  const { url, extra } = splitMeetingLink(raw);
  if (!url) return null;
  return extra ? `${url} (${extra.slice(0, 200)})` : url;
}
