// Regras puras das ferramentas da Plamev para o agente de IA (sem banco nem rede): casar o que o cliente disse
// (raça, plano, idade) com o catálogo da Plamev e montar as mensagens que vão ao cliente.
// Os textos seguem os do widget da equipe (src/widgets/plamev-quote/resumo.ts).

export const semAcento = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cepFormatado = (cep: string) => cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");
const km = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;

export interface Credenciado {
  nome: string; endereco: string; bairro: string; cidade: string; estado: string; telefone: string;
  distanciaKm: number; volante: boolean;
}

/** Lista da rede credenciada para o cliente: mesmo formato que a equipe manda pelo widget. */
export function textoRede(credenciados: Credenciado[], cep: string): string {
  return [
    `Clínicas credenciadas Plamev perto do CEP ${cepFormatado(cep)}:`,
    ...credenciados.flatMap((c, i) => [
      "",
      `${i + 1}. ${c.nome} (${km(c.distanciaKm)})`,
      ...(c.endereco || c.bairro
        ? [[c.endereco, [c.bairro, [c.cidade, c.estado].filter(Boolean).join("/")].filter(Boolean).join(", ")].filter(Boolean).join(" · ")]
        : []),
      ...(c.telefone ? [`Tel.: ${c.telefone}`] : []),
      ...(c.volante ? ["Atendimento volante"] : []),
    ]),
  ].join("\n");
}

export interface Raca { id: string; nome: string }

const SRD = /\b(srd|sem raca|vira lata|viralata|pe duro|mestic[oa]|misturad[oa]|nao sei|indefinid[oa])\b/;

/**
 * Raça do catálogo a partir do que o cliente escreveu. Sem raça definida (ou raça que não está no catálogo) cai
 * na "SRD" da Plamev; `exata` diz se achou a raça pedida.
 */
export function casarRaca(racas: Raca[], dito: string): { raca: Raca; exata: boolean } | null {
  const alvo = semAcento(dito);
  const lista = racas.map((r) => ({ r, n: semAcento(r.nome) }));
  const srd = lista.find((x) => /\bsrd\b|sem raca/.test(x.n))?.r ?? null;
  if (!alvo || SRD.test(alvo)) return srd ? { raca: srd, exata: true } : null;
  const igual = lista.find((x) => x.n === alvo);
  if (igual) return { raca: igual.r, exata: true };
  // "shih tzu" × "shihtzu", "lulu da pomerania" × "spitz alemao (lulu da pomerania)".
  const junto = alvo.replace(/ /g, "");
  const contem = lista.filter((x) => x.n.includes(alvo) || alvo.includes(x.n) || x.n.replace(/ /g, "").includes(junto))
    .sort((a, b) => a.n.length - b.n.length)[0];
  if (contem) return { raca: contem.r, exata: true };
  return srd ? { raca: srd, exata: false } : null;
}

export interface Plano {
  id: string; nome: string; tipoId: string; especie: string; origem: string; coparticipativo: boolean;
  fidelidadeMeses: number | null;
}

/** especie do pet: "1" gato, "2" cachorro (igual à API da Plamev). */
const serveParaEspecie = (p: Plano, especie: "1" | "2") => {
  const e = semAcento(p.especie);
  return e === "todos" || e === "" || (especie === "1" ? e.startsWith("felin") : e.startsWith("canin"));
};

/**
 * Plano do catálogo pelo nome ("advance", "Slim Essencial"...), para a espécie do pet. Nome igual vale mais que
 * nome parecido ("Slim" não vira "Slim Essencial"); com o mesmo nome em mais de uma origem, fica o do site.
 */
export function casarPlano(planos: Plano[], dito: string, especie: "1" | "2"): Plano | null {
  const alvo = semAcento(dito).replace(/^plano /, "");
  if (!alvo) return null;
  const serve = planos.filter((p) => serveParaEspecie(p, especie));
  const porOrigem = (a: Plano, b: Plano) => Number(b.origem === "SITE") - Number(a.origem === "SITE");
  const iguais = serve.filter((p) => semAcento(p.nome) === alvo).sort(porOrigem);
  if (iguais.length) return iguais[0];
  const parecidos = serve.filter((p) => semAcento(p.nome).includes(alvo) || alvo.includes(semAcento(p.nome)))
    .sort((a, b) => a.nome.length - b.nome.length || porOrigem(a, b));
  return parecidos[0] ?? null;
}

/** Nomes dos planos que servem para a espécie, sem repetir (para o agente dizer o que existe). */
export function nomesDosPlanos(planos: Plano[], especie: "1" | "2"): string[] {
  return [...new Set(planos.filter((p) => serveParaEspecie(p, especie)).map((p) => p.nome))];
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Data de nascimento do pet (AAAA-MM-DD): a que o cliente informou ou, sem ela, a idade em meses contada para trás
 * a partir de hoje. null se não dá para saber.
 */
export function nascimentoDoPet(pet: { nascimento?: unknown; idade_meses?: unknown }, hoje: string): string | null {
  if (typeof pet.nascimento === "string" && DATA.test(pet.nascimento) && pet.nascimento <= hoje
    && !Number.isNaN(Date.parse(pet.nascimento))) return pet.nascimento;
  const meses = Number(pet.idade_meses);
  if (!Number.isFinite(meses) || meses < 0 || meses > 40 * 12) return null;
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - Math.round(meses));
  return d.toISOString().slice(0, 10);
}

export interface Simulado {
  mensalidade: number; totalMensalidade: number; descontosMensalidade: number; adesao: number;
  campanha: { nome: string | null; faturas: { periodo: string; total: number }[] } | null;
  fidelidadeAte: string | null;
}

/**
 * Mensagem dos valores para o cliente. É simulação: não tem número de cotação nem link. O valor de cada forma de
 * pagamento vem da Plamev; o agente não digita preço.
 */
export function textoSimulacao(input: {
  pets: { nome: string; plano: string }[];
  cartao: Simulado | null;
  boleto: Simulado | null;
  semCoparticipacao: boolean;
}): string {
  const { cartao, boleto } = input;
  const base = cartao ?? boleto;
  if (!base) return "";
  const de = (s: Simulado) => (s.descontosMensalidade < 0 && s.mensalidade > s.totalMensalidade ? ` (de ${brl(s.mensalidade)})` : "");
  const primeira = (s: Simulado) => (s.adesao > 0 && s.adesao !== s.totalMensalidade ? `, com a 1ª cobrança de ${brl(s.adesao)}` : "");
  // Campanha com mais de um valor depois da adesão (ex.: desconto só nas primeiras faturas).
  const faturas = base.campanha && base.campanha.faturas.length > 2
    ? base.campanha.faturas.map((f) => `• ${f.periodo}: ${brl(f.total)}`) : [];
  const fidelidade = base.fidelidadeAte
    ? `Fidelidade até ${new Date(`${base.fidelidadeAte.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}` : null;
  return [
    "*Simulação Plamev*",
    "",
    ...input.pets.map((p, i) => `• ${p.nome || `Pet ${i + 1}`}: plano ${p.plano}`),
    "",
    ...(cartao ? [`No cartão de crédito: ${brl(cartao.totalMensalidade)} por mês${de(cartao)}${primeira(cartao)}`] : []),
    ...(boleto ? [`No boleto ou Pix: ${brl(boleto.totalMensalidade)} por mês${cartao ? "" : de(boleto)}${primeira(boleto)}`] : []),
    ...faturas,
    ...(input.pets.length > 1 ? ["O valor é o total dos pets juntos."] : []),
    ...(input.semCoparticipacao ? ["Sem coparticipação: você não paga a mais ao usar."] : []),
    ...(fidelidade ? [fidelidade] : []),
  ].join("\n");
}

export interface Material { id: string; titulo: string; tipo: "image" | "document"; conteudoMd: string | null }

/** "Cobertura - Advance" → "advance"; "Comparativos 3 Planos" → "". */
const planoDoTitulo = (titulo: string) => (titulo.includes(" - ") ? semAcento(titulo.split(" - ").slice(1).join(" - ")) : "");

/** Materiais de um plano (pelo nome depois do " - " no título). "Slim" não traz "Slim Essencial". */
export function materiaisDoPlano<T extends Material>(materiais: T[], plano: string): T[] {
  const alvo = semAcento(plano).replace(/^plano /, "");
  return alvo ? materiais.filter((m) => planoDoTitulo(m.titulo) === alvo) : [];
}

/** Material pelo título que o agente pediu: igual, depois o que contém todas as palavras. */
export function casarMaterial<T extends Material>(materiais: T[], dito: string): T | null {
  const alvo = semAcento(dito);
  if (!alvo) return null;
  const igual = materiais.find((m) => semAcento(m.titulo) === alvo);
  if (igual) return igual;
  const palavras = alvo.split(" ");
  const candidatos = materiais.filter((m) => {
    const t = ` ${semAcento(m.titulo)} `;
    return palavras.every((p) => t.includes(` ${p} `));
  }).sort((a, b) => a.titulo.length - b.titulo.length);
  return candidatos[0] ?? null;
}

export interface CampanhaOpcao { id: string; tabelaId: string; nome: string }

/**
 * Campanha que o agente aplica, pela configuração da ferramenta no agente (`tool_settings.plamev_simular_plano`):
 *   { "campanhas": { "advance": "ADVANCE 89" } }  → no plano Advance, a campanha cujo nome contém "ADVANCE 89";
 *   { "politica": "sem_campanha" }                → preço padrão, sem campanha;
 *   sem configuração para o plano                 → "menor_preco": o chamador simula todas e fica com a mais barata.
 */
export function campanhaConfigurada(
  settings: unknown, plano: string, opcoes: CampanhaOpcao[],
): { modo: "fixa"; opcao: CampanhaOpcao } | { modo: "sem_campanha" } | { modo: "menor_preco" } {
  const s = (settings && typeof settings === "object" ? settings : {}) as { campanhas?: Record<string, unknown>; politica?: unknown };
  const mapa = s.campanhas && typeof s.campanhas === "object" ? s.campanhas : {};
  const pedido = Object.entries(mapa).find(([k]) => semAcento(k) === semAcento(plano))?.[1];
  if (typeof pedido === "string" && pedido.trim()) {
    const alvo = semAcento(pedido);
    const opcao = opcoes.find((o) => semAcento(o.nome) === alvo) ?? opcoes.find((o) => semAcento(o.nome).includes(alvo));
    // Campanha configurada que saiu do ar: melhor o preço padrão do que escolher outra por conta própria.
    return opcao ? { modo: "fixa", opcao } : { modo: "sem_campanha" };
  }
  return s.politica === "sem_campanha" ? { modo: "sem_campanha" } : { modo: "menor_preco" };
}
