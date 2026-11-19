// Cliente da API da Plamev: usado pela função plamev-quote (widget) e pelas ferramentas do agente de IA
// (_shared/widgets/plamev-quote/agent-tools.ts). O token é sempre o da org (plamev_credentials) e nunca sai do servidor.
// LGPD: nunca logar token, dados do cliente nem do pet.

import { decryptIntegrationSecret } from "../_shared/integration-credentials.ts";
import * as L from "./logic.ts";

export const BASE = (Deno.env.get("PLAMEV_API_BASE") ?? "https://service.plamev.com.br").replace(/\/+$/, "");
export const CONSULTOR = Deno.env.get("PLAMEV_CONSULTOR_ID")?.trim() || null;

// Catálogo muda pouco: guarda por 1h na instância, por org (tokens diferentes podem ver campanhas diferentes).
const cache = new Map<string, { ate: number; valor: unknown }>();
const UMA_HORA = 60 * 60 * 1000;

/** Trocou ou removeu o token: o que estava guardado da org não vale mais. */
export function esquecerCacheDaOrg(org: string) {
  for (const k of cache.keys()) if (k.startsWith(`${org}:`)) cache.delete(k);
}

/** Uma chamada à API da Plamev, devolvida ao widget em simular/solicitar ("Ver payload"). */
export interface Chamada { metodo: string; url: string; status: number; ms: number; enviado: unknown; recebido: unknown }

export async function plamev(
  token: string,
  path: string,
  // naoEncontrado: 404 da Plamev ("Cotação não localizada", "Nenhum registro encontrado") devolve null em vez de erro.
  init?: { body?: unknown; cacheOrg?: string; trace?: Chamada[]; naoEncontrado?: boolean },
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const chave = init?.cacheOrg ? `${init.cacheOrg}:${path}${init.body ? `:${JSON.stringify(init.body)}` : ""}` : null;
  const hit = chave ? cache.get(chave) : undefined;
  if (hit && hit.ate > Date.now()) return hit.valor;

  const inicio = Date.now();
  const res = await fetch(`${BASE}/${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { Authorization: token, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const texto = await res.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  // Sem o token: só o que foi enviado e o que voltou, para o vendedor conferir com a Plamev.
  init?.trace?.push({
    metodo: init?.body ? "POST" : "GET", url: `${BASE}/${path}`, status: res.status, ms: Date.now() - inicio,
    enviado: init?.body ?? null, recebido: dados ?? (texto ? texto.slice(0, 20_000) : null),
  });
  if (res.status === 404 && init?.naoEncontrado) return null;
  if (!res.ok) {
    console.warn(`[plamev-quote] ${path.split("?")[0]} -> ${res.status}`);
    if (res.status === 401) throw new L.Recusa(502, "plamev_unauthorized", "Token da Plamev recusado");
    throw new L.Recusa(res.status === 400 ? 422 : 502, "plamev_error", L.erroPlamev(dados));
  }
  if (chave) cache.set(chave, { ate: Date.now() + UMA_HORA, valor: dados });
  return dados;
}

export interface EnderecoCep { uf: string; cidade: string; bairro: string; logradouro: string; ponto: { lat: number; lng: number } | null }

/** UF, cidade e coordenadas do CEP (BrasilAPI; só o CEP sai daqui). Guarda por 1h na instância. */
export async function enderecoDoCep(cep: string): Promise<EnderecoCep> {
  const chave = `cep:${cep}`;
  const hit = cache.get(chave);
  if (hit && hit.ate > Date.now()) return hit.valor as EnderecoCep;
  let res: Response;
  try {
    res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new L.Recusa(502, "cep_indisponivel");
  }
  if (res.status === 404 || res.status === 400) throw new L.Recusa(422, "cep_inexistente");
  if (!res.ok) throw new L.Recusa(502, "cep_indisponivel");
  const raw = await res.json().catch(() => null);
  const endereco: EnderecoCep = {
    uf: typeof raw?.state === "string" ? raw.state.trim().toUpperCase() : "",
    cidade: typeof raw?.city === "string" ? raw.city.trim() : "",
    bairro: typeof raw?.neighborhood === "string" ? raw.neighborhood.trim() : "",
    logradouro: typeof raw?.street === "string" ? raw.street.trim() : "",
    ponto: L.coordenadasCep(raw),
  };
  cache.set(chave, { ate: Date.now() + UMA_HORA, valor: endereco });
  return endereco;
}

/** Coordenadas do CEP; recusa quando a BrasilAPI não tem a localização. */
export async function coordenadasDoCep(cep: string): Promise<{ lat: number; lng: number }> {
  const { ponto } = await enderecoDoCep(cep);
  if (!ponto) throw new L.Recusa(422, "cep_sem_localizacao");
  return ponto;
}

/** Rede credenciada perto do CEP (até 50, a mais perto primeiro). `cep` com 8 dígitos; `raio` em km. */
export async function buscarRede(token: string, org: string, cep: string, raio: number) {
  try {
    const raw = await plamev(token, "Credenciados/BuscarRedeCredenciadaPorLocalidade",
      { body: { Cep: cep, Raio: String(raio) }, cacheOrg: org, naoEncontrado: true });
    return raw ? L.rede(raw).slice(0, 50) : [];
  } catch (e) {
    // "CEP não encontrado." vem até para CEP que existe: busca pelas coordenadas do CEP.
    if (!(e instanceof L.Recusa && e.codigo === "plamev_error")) throw e;
  }
  const ponto = await coordenadasDoCep(cep);
  const raw = await plamev(token, "Credenciados/BuscaCredenciados", { body: { Lat: ponto.lat, Lng: ponto.lng, Raio: raio * 1000 } });
  return L.redePorCoordenadas(raw, raio).slice(0, 50);
}

/** Token da Plamev da org, decifrado; null se a org não configurou o widget. */
// deno-lint-ignore no-explicit-any
export async function tokenDaOrg(db: any, org: string): Promise<string | null> {
  const { data } = await db.from("plamev_credentials").select("token_ciphertext").eq("organization_id", org).maybeSingle();
  return data?.token_ciphertext ? await decryptIntegrationSecret(data.token_ciphertext) : null;
}
