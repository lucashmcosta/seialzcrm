// Regras puras do plamev-quote: valida o que o widget manda e enxuga o que a API da Plamev devolve.
// Formato real conferido em produção (2026-11-02); listas vêm como objeto { "1": {...}, "2": {...} }.

export const MODULE_KEY = "plamev_quote";

export const ACTIONS = [
  "estados", "cidades", "racas", "planos", "campanhas", "cupom", "simular", "solicitar",
  "config_get", "config_set", "config_delete",
] as const;
export type Action = typeof ACTIONS[number];
export const CONFIG_ACTIONS: readonly Action[] = ["config_get", "config_set", "config_delete"];

export class Recusa extends Error {
  constructor(public status: number, public codigo: string, mensagem?: string) {
    super(mensagem ?? codigo);
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Raça "sem raça definida" usa ids fixos (SEMRACA1/SEMRACA2) em vez de GUID.
const RACA_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|SEMRACA[12])$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// deno-lint-ignore no-explicit-any
type Json = any;

/** A Plamev devolve listas como objeto numerado; aceita os dois formatos. */
export function lista(v: Json): Json[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
}

const num = (v: Json) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

export function guid(v: unknown, campo: string): string {
  if (typeof v !== "string" || !GUID.test(v)) throw new Recusa(400, `invalid_${campo}`);
  return v;
}

function texto(v: unknown, campo: string, max = 120, obrigatorio = true): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s && obrigatorio) throw new Recusa(400, `missing_${campo}`);
  if (s.length > max) throw new Recusa(400, `invalid_${campo}`);
  return s;
}

export function estados(raw: Json) {
  return lista(raw).filter((e) => e?.Ativo !== false)
    .map((e) => ({ id: e.Id, nome: e.Nome, uf: e.UF }))
    .sort((a, b) => a.uf.localeCompare(b.uf));
}

export function cidades(raw: Json) {
  return lista(raw).filter((c) => c?.Ativo !== false)
    .map((c) => ({ id: c.Id, nome: c.Nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function racas(raw: Json) {
  return lista(raw).filter((r) => r?.Ativo !== false && r?.Ativo !== "0")
    .map((r) => ({ id: r.Id, nome: String(r.Nome ?? "").trim(), porte: String(r.Porte ?? "") }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Planos com preço da região. "A partir de" = mensalidade de 1 pet no boleto e no cartão (já com desconto do cartão). */
export function planos(raw: Json) {
  return lista(raw?.Coberturas).filter((c) => c?.Ativo === "1" || c?.Ativo === true).map((c) => {
    const v = lista(c.Valores)[0];
    return {
      id: c.Id as string,
      nome: c.Nome as string,
      tipoId: String(c.TiposCoberturasId),
      tipoNome: c.TiposCoberturasNome as string,
      especie: (c.Especie ?? "TODOS") as string,
      origem: (c.OrigemCheckout ?? "SITE") as string,
      maisVendido: c.MaisVendido === "1",
      reembolso: c.Reembolso === "1",
      coparticipativo: c.Coparticipativo === "1",
      fidelidadeMeses: v ? Number(v.PlanosFidelidade) || null : null,
      procedimentos: v ? Number(v.CoberturasQuantidadeProcedimentos) || null : null,
      boleto: num(c.Boleto?.Composicao?.ValorTotalMensalidade ?? c.Boleto?.Composicao?.ValorTotal),
      cartao: num(c.Cartao?.Composicao?.ValorTotalMensalidade ?? c.Cartao?.Composicao?.ValorTotal),
    };
  });
}

/** Campanhas do tipo de plano no estado, já com as tabelas (cada campanha tem pelo menos uma). */
export function campanhas(raw: Json) {
  return lista(raw).map((c) => ({ id: c.CampanhasCoberturasId as string, nome: c.CampanhasCoberturasNome as string }));
}

export function tabelas(raw: Json) {
  return lista(raw).filter((t) => t?.Ativo === "1" || t?.Ativo === true)
    .map((t) => ({ id: t.Id as string, nome: t.Nome as string, tipo: t.Tipo as string }));
}

export interface PetEntrada { nome: string; especie: "1" | "2"; racaId: string; nascimento: string; coberturaId: string }

export interface PedidoSimulacao {
  estadoId: string;
  formaPagamento: 1 | 2;
  origem: string;
  pets: PetEntrada[];
  campanha: { id: string; tabelaId: string } | null;
  cupom: string | null;
}

export function pedidoSimulacao(body: Json): PedidoSimulacao {
  const estadoId = guid(body?.estado_id, "estado_id");
  const formaPagamento = body?.forma_pagamento === 1 ? 1 : body?.forma_pagamento === 2 ? 2 : null;
  if (!formaPagamento) throw new Recusa(400, "invalid_forma_pagamento");
  const origem = texto(body?.origem ?? "SITE", "origem", 20);
  if (!Array.isArray(body?.pets) || body.pets.length < 1 || body.pets.length > 10) throw new Recusa(400, "invalid_pets");
  const hoje = new Date().toISOString().slice(0, 10);
  const pets = body.pets.map((p: Json): PetEntrada => {
    if (p?.especie !== "1" && p?.especie !== "2") throw new Recusa(400, "invalid_especie");
    if (typeof p?.raca_id !== "string" || !RACA_ID.test(p.raca_id)) throw new Recusa(400, "invalid_raca_id");
    if (typeof p?.nascimento !== "string" || !DATA.test(p.nascimento) || p.nascimento > hoje) throw new Recusa(400, "invalid_nascimento");
    return {
      nome: texto(p?.nome, "nome_pet", 60, false),
      especie: p.especie,
      racaId: p.raca_id,
      nascimento: p.nascimento,
      coberturaId: guid(p?.cobertura_id, "cobertura_id"),
    };
  });
  const campanha = body?.campanha
    ? { id: guid(body.campanha.id, "campanha_id"), tabelaId: guid(body.campanha.tabela_id, "tabela_id") }
    : null;
  const cupom = texto(body?.cupom, "cupom", 40, false) || null;
  return { estadoId, formaPagamento, origem, pets, campanha, cupom };
}

/** Pets no formato da Plamev (SimulaCotacaoPet / Pets da cotação). */
function petsPlamev(p: PedidoSimulacao) {
  return p.pets.map((pet) => ({
    Nome: pet.nome || undefined,
    Especie: pet.especie,
    RacasId: pet.racaId,
    DataNascimento: pet.nascimento,
    CoberturasId: pet.coberturaId,
    ...(p.cupom ? { CupomDesconto: p.cupom } : {}),
    ...(p.campanha ? { CampanhasCoberturasId: p.campanha.id, CampanhasCoberturasTabelasId: p.campanha.tabelaId } : {}),
  }));
}

export function corpoSimulacao(p: PedidoSimulacao, consultorId: string | null) {
  return {
    FormaPagamento: p.formaPagamento,
    EstadosId: p.estadoId,
    OrigemCheckout: p.origem,
    ...(consultorId ? { ConsultoresId: consultorId } : {}),
    ...(p.campanha ? { NovaCampanha: 1 } : {}),
    CotacoesPets: petsPlamev(p),
  };
}

export interface Cliente {
  nome: string; email: string; ddd: string; telefone: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidadeId: string;
}

export function cliente(body: Json): Cliente {
  const c = body?.cliente ?? {};
  const email = texto(c.email, "email", 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Recusa(400, "invalid_email");
  const fone = String(c.telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (fone.length < 10 || fone.length > 11) throw new Recusa(400, "invalid_telefone");
  const cep = String(c.cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) throw new Recusa(400, "invalid_cep");
  return {
    nome: texto(c.nome, "nome", 120),
    email,
    ddd: fone.slice(0, 2),
    telefone: fone.slice(2),
    cep,
    logradouro: texto(c.logradouro, "logradouro", 160),
    numero: texto(c.numero, "numero", 20),
    complemento: texto(c.complemento, "complemento", 80, false),
    bairro: texto(c.bairro, "bairro", 80),
    cidadeId: guid(c.cidade_id, "cidade_id"),
  };
}

export function corpoCotacao(p: PedidoSimulacao, c: Cliente, consultorId: string | null) {
  return {
    ...(consultorId ? { ConsultoresId: consultorId } : {}),
    ...(p.cupom ? { CupomDesconto: p.cupom } : {}),
    Nome: c.nome,
    Email: c.email,
    Ddd: c.ddd,
    Telefone: c.telefone,
    // Valores padrão da documentação (Site = 1, CotacoesOrigensId = 2).
    Site: 1,
    CotacoesOrigensId: 2,
    FormaPagamento: p.formaPagamento,
    Cep: c.cep,
    Logradouro: c.logradouro,
    Numero: c.numero,
    Complemento: c.complemento || undefined,
    Bairro: c.bairro,
    EstadosId: p.estadoId,
    CidadesId: c.cidadeId,
    CotacoesPets: petsPlamev(p),
  };
}

const linhas = (v: Json) => lista(v)
  .map((l) => ({ nome: String(l?.Nome ?? ""), valor: num(l?.Valor) }))
  .filter((l) => l.nome && l.valor !== 0);

/** Resultado da simulação/cotação: só o que o vendedor precisa ver. */
export function resultado(raw: Json) {
  return {
    mensalidade: num(raw?.ValorMensalidade ?? raw?.ValorTotal),
    totalMensalidade: num(raw?.ValorTotalMensalidade ?? raw?.ValorTotal),
    descontosMensalidade: num(raw?.ValorDescontosMensalidades),
    adesao: num(raw?.ValorAdesao),
    fidelidadeAte: typeof raw?.DataFidelidade === "string" ? raw.DataFidelidade : null,
    composicaoMensalidade: linhas(raw?.ComposicaoMensalidade),
    composicaoAdesao: linhas(raw?.ComposicaoAdesao),
    ...(raw?.NumeroCotacao ? { numeroCotacao: String(raw.NumeroCotacao), cotacaoId: String(raw.Id ?? "") } : {}),
  };
}

/** Mensagem de erro da Plamev sem o eco de cabeçalhos/token que ela manda em "argumento". */
export function erroPlamev(raw: Json): string {
  const m = typeof raw?.mensagem === "string" ? raw.mensagem : typeof raw?.erro === "string" ? raw.erro : "";
  return m.replace(/\s*Código da Mensagem:.*$/i, "").slice(0, 200) || "Erro na API da Plamev";
}

/** Token colado pela org (portal Plamev → Token API). Alfanumérico, sem espaços; o real tem 850 caracteres. */
export function tokenColado(v: unknown): string {
  const t = typeof v === "string" ? v.replace(/^\s*Authorization:\s*/i, "").replace(/^Bearer\s+/i, "").trim() : "";
  if (t.length < 32 || t.length > 4096 || !/^[A-Za-z0-9._~+/=-]+$/.test(t)) throw new Recusa(400, "invalid_token");
  return t;
}
