// Confere se o cliente que vai receber um aviso é a parte do processo.
//
// O aviso chega pela oportunidade ligada ao processo. Se o vínculo estiver errado
// (processo de uma pessoa ligado à oportunidade de outra), o aviso iria para a pessoa
// errada. Aqui se compara o nome do contato com o nome da parte no título do processo
// ("FULANO DE TAL x EMPRESA LTDA").
//
// Só bloqueia quando dá para afirmar que são pessoas diferentes. Sem nome de um dos
// lados (título provisório, emoji, ponto) a resposta é "não dá para saber" e o aviso segue.
// Sem dependências: puro, para os testes.

const STOP = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "D"]);

function tokens(name: string): string[] {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Nome da parte autora no título do processo, ou null se o título não traz nome. */
export function processPartyName(title: string | null | undefined): string | null {
  if (!title) return null;
  let t = title.trim()
    .replace(/^\(([^)]*)\)\s*/, "") // "(CANCELADO) ..."
    .replace(/^oportunidade\s*[-–—:]\s*/i, "");
  // "AUTOR x RÉU", "AUTOR × RÉU", "AUTOR X RÉU", "AUTOR XRÉU LTDA" (sem espaço depois do X)
  t = t.split(/\s+[x×]\s*|\s*×\s*|\s+vs\.?\s+/i)[0] ?? "";
  t = t.trim();
  return t ? t : null;
}

function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  // distância de edição ≤ 1 (erro de digitação: TALES / TALLES)
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export type NameMatch = "match" | "mismatch" | "unknown";

export function matchClientToProcess(contactName: string | null | undefined, processTitle: string | null | undefined): NameMatch {
  const party = processPartyName(processTitle);
  if (!party || !contactName) return "unknown";
  const a = tokens(contactName);
  const b = tokens(party);
  if (!a.length || !b.length) return "unknown";
  // Mesmo primeiro nome (aceita um erro de digitação).
  if (nearlyEqual(a[0], b[0])) return "match";
  // Nome escrito em outra ordem ou com o primeiro nome abreviado: pelo menos dois nomes em comum.
  const shared = new Set(a.filter((t) => b.includes(t)));
  if (shared.size >= 2) return "match";
  return "mismatch";
}
