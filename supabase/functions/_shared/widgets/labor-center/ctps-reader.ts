/**
 * Leitura da carteira de trabalho digital em PDF que o cliente manda na conversa.
 *
 * Usa o mesmo leitor da tela da oportunidade (_shared/documentos/ctps.ts): só a camada de texto
 * do PDF. Foto ou PDF escaneado não entram, porque ler texto de foto erra dígito. Para o agente vão
 * só a empresa e as datas de cada emprego, nunca CPF, CNPJ ou outro dado do documento.
 */
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { vinculosDaCtps, type VinculoCtps } from "../../documentos/ctps.ts";
import { isValidCnpjValue } from "../../registry/providers.ts";

type SupabaseLike = { storage: any };

const MAX_EMPREGOS = 4;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** Bucket e caminho de uma URL do Storage do Supabase (pública ou assinada). */
export function storageRef(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
}

/** Texto curto para o agente com os empregos da carteira, ou null se não houver nenhum. */
export function describeCtps(vinculos: VinculoCtps[]): string | null {
  const lidos = vinculos.filter((v) => v.periodo).slice(0, MAX_EMPREGOS);
  if (!lidos.length) return null;
  const linhas = lidos.map((v, i) => {
    const [inicio, fim] = (v.periodo ?? "").split(/\s*-\s*/);
    const quando = v.atual ? `desde ${inicio} (contrato aberto)` : `de ${inicio} a ${fim} (contrato encerrado)`;
    return `${i + 1}) ${v.empregador ?? "empresa sem nome legível"}, ${quando}`;
  });
  return `[O sistema leu a carteira de trabalho digital que o cliente mandou. Empregos: ${linhas.join("; ")}. ` +
    "Use essas datas na calculadora para a empresa do caso, sem perguntar de novo. Se houver mais de uma empresa e não estiver claro qual é o caso, pergunte qual. " +
    "Não diga que conferiu outros dados do documento.]";
}

function firstUrl(mediaUrls: unknown): string | null {
  if (Array.isArray(mediaUrls)) return mediaUrls.find((u): u is string => typeof u === "string") ?? null;
  return typeof mediaUrls === "string" ? mediaUrls : null;
}

/** Baixa o PDF da mensagem e lê os empregos. Qualquer falha devolve null: o agente segue sem a leitura. */
export async function readCtpsPdf(supabase: SupabaseLike, mediaUrls: unknown, caption: string | null): Promise<string | null> {
  const url = firstUrl(mediaUrls);
  if (!url) return null;
  const isPdf = /\.pdf(\?|$)/i.test(url) || /\.pdf$/i.test(caption ?? "");
  const ref = storageRef(url);
  if (!isPdf || !ref) return null;
  try {
    const dl = await supabase.storage.from(ref.bucket).download(ref.path);
    if (dl.error || !dl.data) return null;
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) return null;
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const texto = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    return describeCtps(vinculosDaCtps(texto, isValidCnpjValue));
  } catch (e) {
    console.warn("[labor-center] não leu a carteira em PDF", (e as Error).message);
    return null;
  }
}
