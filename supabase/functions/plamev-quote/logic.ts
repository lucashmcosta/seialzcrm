// Regras puras do plamev-quote: valida o que o widget manda e enxuga o que a API da Plamev devolve.
// Formato real conferido em produção (2026-11-02); listas vêm como objeto { "1": {...}, "2": {...} }.

export const MODULE_KEY = "plamev_quote";

export const ACTIONS = [
  "estados", "cidades", "racas", "planos", "campanhas", "cupom", "simular", "solicitar", "contexto", "rede", "pagamento", "materiais", "perguntar",
  "config_get", "config_set", "config_delete", "config_opcoes",
] as const;
export type Action = typeof ACTIONS[number];
export const CONFIG_ACTIONS: readonly Action[] = ["config_get", "config_set", "config_delete", "config_opcoes"];
/** Chamada pelo pg_cron com a service_role, sem usuário: confere o pagamento das cotações em aberto. */
export const CRON_ACTION = "pagamentos_cron";

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

export interface PetEntrada {
  nome: string; especie: "1" | "2"; racaId: string; nascimento: string; coberturaId: string; sexo: "M" | "F" | null;
}

/** Valor de Sexo que a Plamev espera (fora do Swagger; M/F confirmado em produção em 2026-11-02). Simulação não exige; gravar cotação exige. */
export const SEXO_PLAMEV: Record<"M" | "F", string> = { M: "M", F: "F" };

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
    if (p?.sexo != null && p.sexo !== "M" && p.sexo !== "F") throw new Recusa(400, "invalid_sexo");
    return {
      sexo: p?.sexo ?? null,
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
    ...(pet.sexo ? { Sexo: SEXO_PLAMEV[pet.sexo] } : {}),
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

/** CPF com dígitos verificadores. */
export function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export interface Cliente {
  nome: string; documento: string; email: string; ddd: string; telefone: string;
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
  const documento = String(c.cpf ?? "").replace(/\D/g, "");
  if (!cpfValido(documento)) throw new Recusa(400, "invalid_cpf");
  return {
    nome: texto(c.nome, "nome", 120),
    documento,
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
  // A Plamev recusa cotação de pet sem sexo ("dados inválidos"); a simulação aceita sem.
  if (p.pets.some((pet) => !pet.sexo)) throw new Recusa(400, "missing_sexo");
  return {
    ...(consultorId ? { ConsultoresId: consultorId } : {}),
    ...(p.cupom ? { CupomDesconto: p.cupom } : {}),
    Nome: c.nome,
    // Documento (CPF) não está no Swagger da cotação, mas o checkout do site da Plamev envia.
    Documento: c.documento,
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

/**
 * Link de pagamento que o cliente abre para fechar: checkout da Plamev com o Id da cotação em base64
 * (fora do Swagger; formato conferido com o link gerado pela cotação 202611000000020-01).
 */
export function linkPagamento(cotacaoId: string): string | null {
  return GUID.test(cotacaoId) ? `https://cliente.plamev.com.br/pagamento/checkout/${btoa(cotacaoId.toUpperCase())}/` : null;
}

/**
 * `ComposicaoCampanha` (fora do Swagger, desde 2026-11-03): valor de cada fatura com o desconto da campanha. Os campos
 * antigos (ValorTotalMensalidade, ComposicaoMensalidade) não aplicam o desconto da campanha nas mensalidades.
 * Tabela = um item por pet, com uma linha por período ("1ª Fatura (Adesão)", "Demais Faturas"...). Detalhes de
 * desconto vêm positivos; aqui viram negativos, como em ComposicaoMensalidade.
 */
function campanha(raw: Json) {
  const c = raw?.ComposicaoCampanha;
  if (!c || typeof c !== "object") return null;
  const pets = lista(c.Tabela).map((t) => ({
    nome: String(t?.PetNome ?? ""),
    faturas: lista(t?.Linhas).map((l) => ({
      periodo: String(l?.Periodo ?? "").trim(),
      total: num(l?.Total),
      detalhes: lista(l?.Detalhes)
        .map((d) => ({
          nome: String(d?.Descricao ?? ""),
          valor: String(d?.Tipo ?? "").toLowerCase() === "desconto" ? -Math.abs(num(d?.Valor)) : num(d?.Valor),
        }))
        .filter((d) => d.nome && d.valor !== 0),
    })).filter((l) => l.periodo),
  })).filter((p) => p.faturas.length > 0);
  if (!pets.length) return null;
  // Soma dos pets por período, na ordem em que aparecem.
  const faturas: { periodo: string; total: number }[] = [];
  for (const p of pets) {
    for (const l of p.faturas) {
      const f = faturas.find((x) => x.periodo === l.periodo);
      if (f) f.total = num(f.total + l.total);
      else faturas.push({ periodo: l.periodo, total: l.total });
    }
  }
  return { nome: String(c.NomeCampanha ?? "").trim() || null, faturas, pets, totalAdesao: num(c.TotalAdesao) };
}

/** Resultado da simulação/cotação: só o que o vendedor precisa ver. */
export function resultado(raw: Json) {
  const mensalidade = num(raw?.ValorMensalidade ?? raw?.ValorTotal);
  const camp = campanha(raw);
  // Com campanha, a mensalidade é a primeira fatura depois da adesão (a 1ª fatura é a adesão).
  const recorrente = camp?.faturas.find((f, i) => i > 0 && !/ades[aã]o/i.test(f.periodo));
  const totalMensalidade = recorrente ? recorrente.total : num(raw?.ValorTotalMensalidade ?? raw?.ValorTotal);
  return {
    mensalidade,
    totalMensalidade,
    descontosMensalidade: recorrente ? num(totalMensalidade - mensalidade) : num(raw?.ValorDescontosMensalidades),
    adesao: camp?.totalAdesao || num(raw?.ValorAdesao),
    campanha: camp,
    fidelidadeAte: typeof raw?.DataFidelidade === "string" ? raw.DataFidelidade : null,
    composicaoMensalidade: linhas(raw?.ComposicaoMensalidade),
    composicaoAdesao: linhas(raw?.ComposicaoAdesao),
    ...(raw?.NumeroCotacao
      ? {
        numeroCotacao: String(raw.NumeroCotacao),
        cotacaoId: String(raw.Id ?? ""),
        linkPagamento: linkPagamento(String(raw.Id ?? "")),
      }
      : {}),
  };
}

/**
 * Contato do Seialz → dados do cliente no formulário. Cidade e estado vão como texto (o widget casa com as
 * listas da Plamev). Telefone sem +55. Campo vazio fica "".
 */
export function clienteDoContato(c: Json) {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const fone = s(c?.phone).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return {
    nome: s(c?.full_name) || [s(c?.first_name), s(c?.last_name)].filter(Boolean).join(" "),
    cpf: s(c?.cpf).replace(/\D/g, ""),
    email: s(c?.email),
    telefone: fone,
    cep: s(c?.address_zip).replace(/\D/g, ""),
    logradouro: s(c?.address_street),
    numero: s(c?.address_number),
    complemento: s(c?.address_complement),
    bairro: s(c?.address_neighborhood),
    cidade: s(c?.address_city),
    estado: s(c?.address_state),
  };
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Nota na linha do tempo da oportunidade quando a cotação é gravada. */
export function notaCotacao(r: ReturnType<typeof resultado>, pets: { nome: string; plano: string }[], forma: 1 | 2) {
  return {
    title: `Cotação Plamev nº ${r.numeroCotacao}`,
    body: [
      ...pets.map((p, i) => `${p.nome || `Pet ${i + 1}`}: plano ${p.plano}`),
      `Mensalidade ${brl(r.totalMensalidade)} · adesão ${brl(r.adesao)} · ${forma === 2 ? "cartão" : "boleto"}`,
      ...(r.linkPagamento ? [`Link de pagamento: ${r.linkPagamento}`] : []),
    ].join("\n"),
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

/** CEP só com números (8 dígitos). */
export function cep(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 8) throw new Recusa(400, "invalid_cep");
  return d;
}

/** Raio da busca da rede credenciada, em km (1 a 50; padrão 5). */
export function raioKm(v: unknown): number {
  if (v == null || v === "") return 5;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Recusa(400, "invalid_raio");
  return n;
}

/**
 * `Credenciados/BuscarRedeCredenciadaPorLocalidade` → clínicas mais perto primeiro. Com resultado vem a lista pura;
 * sem clínica no raio vem 200 `{ Mensagem, CepPesquisado, EnderecoPesquisado, RedeCredenciada: [] }` (conferido em
 * produção em 2026-11-08). CEP inexistente volta 400 "CEP não encontrado.".
 */
export function rede(raw: Json) {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const itens = raw && typeof raw === "object" && !Array.isArray(raw) && "RedeCredenciada" in raw ? raw.RedeCredenciada : raw;
  return lista(itens).map((c) => {
    const ddd = s(c?.IndividuosContatosDdd).replace(/\D/g, "");
    const fone = s(c?.IndividuosContatosTelefone).replace(/\D/g, "");
    return {
      id: s(c?.CredenciadosId),
      nome: s(c?.IndividuosNomeFantasia) || s(c?.CredenciadosNomeCredenciado) || s(c?.IndividuosNome),
      endereco: [s(c?.IndividuosEnderecosLogradouro), s(c?.IndividuosEnderecosNumero)].filter(Boolean).join(", "),
      bairro: s(c?.IndividuosEnderecosBairro),
      cidade: s(c?.IndividuosEnderecosCidadesNome),
      estado: s(c?.IndividuosEnderecosEstadosNome),
      cep: s(c?.IndividuosEnderecosCep).replace(/\D/g, ""),
      telefone: fone ? (ddd ? `(${ddd}) ${fone}` : fone) : "",
      distanciaKm: Math.round(Number(c?.DistanciaKm) * 10) / 10 || 0,
      volante: c?.TiposEstabelecimentosVolante === "1",
      observacao: s(c?.CredenciadosObservacaoGeral).slice(0, 300),
    };
  }).filter((c) => c.nome).sort((a, b) => a.distanciaKm - b.distanciaKm);
}

/** Latitude/longitude do CEP pela BrasilAPI (`/api/cep/v2`); null se ela não tiver a localização. */
export function coordenadasCep(raw: Json): { lat: number; lng: number } | null {
  const c = raw?.location?.coordinates;
  const lat = Number(c?.latitude);
  const lng = Number(c?.longitude);
  if (!c?.latitude || !c?.longitude || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * `Credenciados/BuscaCredenciados` (Lat/Lng): plano B quando a busca por CEP da Plamev diz "CEP não encontrado" para CEP
 * que existe (acontece com a maioria; conferido em 2026-11-09). Ela ignora o raio e devolve a rede toda com
 * `DistanciaLinhaReta` em km: o raio é filtrado aqui. Só entra credenciado ativo, exibido no site e não bloqueado.
 */
export function redePorCoordenadas(raw: Json, raioKm: number) {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return lista(raw).map((item) => {
    const c = item?.Credenciados ?? {};
    const ddd = s(c.Ddd).replace(/\D/g, "");
    const fone = s(c.Telefone).replace(/\D/g, "");
    const visivel = s(c.Situacao) === "1" && s(c.ExibeSite) !== "0" && s(c.Bloqueado) !== "1";
    return {
      visivel,
      id: s(c.Id),
      nome: s(c.NomeFantasia) || s(c.NomeCredenciado) || s(c.Nome),
      endereco: [s(c.Logradouro), s(c.Numero)].filter(Boolean).join(", "),
      bairro: s(c.Bairro),
      cidade: s(c.Cidade),
      estado: s(c.Estado),
      cep: s(c.Cep).replace(/\D/g, ""),
      telefone: fone ? (ddd ? `(${ddd}) ${fone}` : fone) : "",
      distanciaKm: Math.round(Number(item?.DistanciaLinhaReta) * 10) / 10 || 0,
      volante: false,
      observacao: "",
    };
  }).filter((c) => c.visivel && c.nome && c.distanciaKm <= raioKm)
    .map(({ visivel: _, ...c }) => c)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

/**
 * `Cotacoes/VerificarConversaoVenda/{Id}`: virou venda? adesão paga? (só `PAGA` conta; isenta não).
 * Datas da Plamev vêm como "AAAA-MM-DD ..."; guardamos só o dia.
 */
export function conversao(raw: Json) {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const dia = (v: unknown) => {
    const t = s(v);
    return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
  };
  const adesao = raw?.Adesao && typeof raw.Adesao === "object" ? raw.Adesao : null;
  const venda = raw?.Venda && typeof raw.Venda === "object" ? raw.Venda : null;
  return {
    virouVenda: raw?.VirouVenda === true,
    adesaoPaga: raw?.AdesaoPaga === true,
    adesaoSituacao: s(adesao?.Situacao)?.toUpperCase() ?? null,
    vendaSituacao: s(venda?.SituacaoNome),
    valorPago: adesao ? num(adesao.ValorPago) : null,
    pagoEm: dia(adesao?.DataPagamento),
  };
}

/** Nota na linha do tempo quando a Plamev confirma a adesão paga. */
export function notaPagamento(numeroCotacao: string, c: ReturnType<typeof conversao>, ganha: boolean) {
  const data = c.pagoEm ? c.pagoEm.split("-").reverse().join("/") : null;
  return {
    title: `Adesão paga · cotação Plamev nº ${numeroCotacao}`,
    body: [
      `Pagamento da adesão confirmado pela Plamev${data ? ` em ${data}` : ""}.`,
      ...(c.valorPago ? [`Valor pago: ${brl(c.valorPago)}`] : []),
      ...(c.vendaSituacao ? [`Situação da venda: ${c.vendaSituacao}`] : []),
      ...(ganha ? ["Oportunidade marcada como ganha automaticamente."] : []),
    ].join("\n"),
  };
}

/** URL pública de um material (bucket plamev-materiais), com cada parte do caminho codificada. */
export function urlMaterial(supabaseUrl: string, storagePath: string): string {
  const caminho = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/plamev-materiais/${caminho}`;
}
