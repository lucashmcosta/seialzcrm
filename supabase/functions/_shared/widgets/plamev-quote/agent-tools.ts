/**
 * O widget Plamev como ferramentas do agente de IA: rede credenciada pelo CEP, simulação de preço e materiais de
 * apoio (ler o texto revisado e enviar a imagem/PDF). São as mesmas chamadas e os mesmos textos do widget da equipe.
 *
 * Nenhuma grava nada na Plamev: a simulação não cria cotação. Cotação gravada e link de pagamento continuam com a
 * equipe, no widget. O token é o da org (plamev_credentials).
 * LGPD: nunca logar dados do cliente nem do pet. Só ferramenta, org e resultado.
 */
import type { WidgetAgentTool, WidgetToolContext, WidgetToolOutcome } from "../agent-tools.ts";
import * as L from "../../../plamev-quote/logic.ts";
import * as R from "./regras.ts";

export const PLAMEV_WIDGET_KEY = "plamev_quote";
export const PLAMEV_REDE_TOOL = "plamev_consultar_rede";
export const PLAMEV_SIMULAR_TOOL = "plamev_simular_plano";
export const PLAMEV_LER_MATERIAL_TOOL = "plamev_ler_materiais";
export const PLAMEV_ENVIAR_MATERIAL_TOOL = "plamev_enviar_material";

/** Começo da mensagem de valores, para saber se a mesma simulação já foi mandada nesta conversa. */
export const SIMULACAO_HEADER = "*Simulação Plamev*";

/** Raios da busca da rede: perto de casa primeiro; sem nada, a cidade e arredores. */
const RAIOS_KM = [5, 20, 50];
const CLINICAS_NA_MENSAGEM = 5;
/** Simular todas as campanhas para achar a mais barata custa uma chamada cada: limita. */
const MAX_CAMPANHAS = 8;

/** O que as ferramentas precisam do mundo de fora (API da Plamev e CEP). Nos testes entra um falso. */
export interface PlamevApi {
  // deno-lint-ignore no-explicit-any
  plamev(path: string, init?: { body?: unknown; cache?: boolean }): Promise<any>;
  rede(cep: string, raioKm: number): Promise<R.Credenciado[]>;
  enderecoDoCep(cep: string): Promise<{ uf: string; cidade: string }>;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function motivoDaFalha(e: unknown): string {
  const codigo = e instanceof L.Recusa ? e.codigo : "";
  if (codigo === "cep_inexistente" || codigo === "invalid_cep") return "O CEP não existe. Peça ao cliente para conferir o CEP (8 números).";
  if (codigo === "cep_sem_localizacao" || codigo === "cep_indisponivel") return "Não foi possível localizar esse CEP agora. Peça o CEP de novo ou passe para a equipe.";
  return "A consulta à Plamev falhou agora. Não invente a resposta: diga que vai confirmar e passe para a equipe se o cliente precisar disso para seguir.";
}

// ───────────────────────────── Rede credenciada ─────────────────────────────

export async function rodarRede(args: { cep?: unknown }, api: PlamevApi): Promise<WidgetToolOutcome> {
  const cep = soDigitos(args?.cep);
  if (cep.length !== 8) return { modelMessage: "CEP inválido. Peça ao cliente o CEP com 8 números." };
  try {
    for (const raio of RAIOS_KM) {
      const rede = await api.rede(cep, raio);
      if (!rede.length) continue;
      const perto = rede.slice(0, CLINICAS_NA_MENSAGEM);
      const local = [perto[0].cidade, perto[0].estado].filter(Boolean).join("/");
      return {
        clientText: R.textoRede(perto, cep),
        modelMessage: [
          `A lista das ${perto.length} clínicas mais perto vai para o cliente logo depois do seu texto. Não repita nomes nem endereços.`,
          `Foram encontradas ${rede.length}${rede.length >= 50 ? " ou mais" : ""} credenciadas em até ${raio} km${local ? ` (${local})` : ""}. A mais perto fica a ${perto[0].distanciaKm} km.`,
          raio > RAIOS_KM[0] ? `Não há credenciada a menos de ${RAIOS_KM[0]} km: diga isso com clareza e pergunte se essa distância serve.` : "",
          "Não diga que uma clínica atende 24 h ou tem uma especialidade se isso não estiver na lista.",
        ].filter(Boolean).join("\n"),
      };
    }
    return {
      modelMessage: `Não há clínica credenciada da Plamev em até ${RAIOS_KM[RAIOS_KM.length - 1]} km desse CEP. Diga isso ao cliente com honestidade: sem rede perto o plano não serve para ele. Não ofereça plano nem simulação. Se ele tiver outro endereço onde levaria o pet, consulte esse CEP.`,
    };
  } catch (e) {
    return { modelMessage: motivoDaFalha(e) };
  }
}

// ───────────────────────────── Simulação de preço ─────────────────────────────

interface PetDito { nome?: unknown; especie?: unknown; raca?: unknown; nascimento?: unknown; idade_meses?: unknown }

export interface SimulacaoArgs { cep?: unknown; plano?: unknown; pets?: unknown }

export async function rodarSimulacao(
  args: SimulacaoArgs, api: PlamevApi, settings: unknown, hoje: string, history: WidgetToolContext["history"],
): Promise<WidgetToolOutcome> {
  const cep = soDigitos(args?.cep);
  const planoDito = typeof args?.plano === "string" ? args.plano.trim() : "";
  const pets = (Array.isArray(args?.pets) ? args.pets : []) as PetDito[];
  const falta: string[] = [];
  if (cep.length !== 8) falta.push("o CEP do cliente (8 números)");
  if (!planoDito) falta.push("qual plano simular");
  if (!pets.length) falta.push("os dados do pet");
  if (pets.length > 10) return { modelMessage: "São muitos pets para uma simulação. Passe a conversa para a equipe." };
  pets.forEach((p, i) => {
    const quem = typeof p?.nome === "string" && p.nome.trim() ? p.nome.trim() : `pet ${i + 1}`;
    if (p?.especie !== "cao" && p?.especie !== "gato") falta.push(`se ${quem} é cachorro ou gato`);
    if (!R.nascimentoDoPet(p ?? {}, hoje)) falta.push(`a idade ou a data de nascimento de ${quem}`);
  });
  if (falta.length) {
    return { modelMessage: `Ainda não dá para simular. Não fale em valores. Falta saber: ${falta.join("; ")}. Pergunte uma coisa por vez e chame a ferramenta de novo com tudo.` };
  }

  try {
    const { uf } = await api.enderecoDoCep(cep);
    const estado = L.estados(await api.plamev("Estados/consultar", { cache: true })).find((e) => e.uf === uf);
    if (!estado) return { modelMessage: `A Plamev não vende plano no estado desse CEP (${uf || "não identificado"}). Diga isso ao cliente com honestidade e não fale em valores.` };

    const planos = L.planos(await api.plamev(
      `Coberturas/BuscarCoberturasComPreco?${q({ EstadosId: estado.id, Cidades: "NULL", Valores: "true", order: "Ordem" })}`, { cache: true },
    )) as R.Plano[];

    const racasPor: Partial<Record<"1" | "2", R.Raca[]>> = {};
    const entrada: L.PetEntrada[] = [];
    const resumo: { nome: string; plano: string }[] = [];
    const avisos: string[] = [];
    let semCoparticipacao = true;
    const tipos = new Set<string>();
    for (const [i, p] of pets.entries()) {
      const especie = p.especie === "gato" ? "1" : "2";
      const plano = R.casarPlano(planos, planoDito, especie);
      if (!plano) {
        return { modelMessage: `Não existe o plano "${planoDito}" para ${especie === "1" ? "gato" : "cachorro"} nessa região. Planos disponíveis: ${R.nomesDosPlanos(planos, especie).join(", ") || "nenhum"}. Não fale em valores; ofereça um dos disponíveis.` };
      }
      racasPor[especie] ??= L.racas(await api.plamev(`Racas/consultar?${q({ Especie: especie })}`, { cache: true })) as R.Raca[];
      const raca = R.casarRaca(racasPor[especie]!, typeof p.raca === "string" ? p.raca : "");
      if (!raca) return { modelMessage: "Não foi possível identificar a raça no cadastro da Plamev. Passe a conversa para a equipe fazer a cotação." };
      const nome = typeof p.nome === "string" ? p.nome.trim().slice(0, 60) : "";
      if (!raca.exata) avisos.push(`A raça de ${nome || `pet ${i + 1}`} não está no cadastro da Plamev; a simulação usou "sem raça definida". Avise que o valor é confirmado na cotação.`);
      entrada.push({ nome, especie, racaId: raca.raca.id, nascimento: R.nascimentoDoPet(p, hoje)!, coberturaId: plano.id, sexo: null });
      resumo.push({ nome, plano: plano.nome });
      semCoparticipacao &&= !plano.coparticipativo;
      tipos.add(plano.tipoId);
    }
    const origem = planos.find((p) => p.id === entrada[0].coberturaId)?.origem ?? "SITE";

    const simular = async (forma: 1 | 2, campanha: R.CampanhaOpcao | null) => {
      const pedido: L.PedidoSimulacao = {
        estadoId: estado.id, formaPagamento: forma, origem, pets: entrada,
        campanha: campanha ? { id: campanha.id, tabelaId: campanha.tabelaId } : null, cupom: null,
      };
      return L.resultado(await api.plamev("Cotacoes/SimulaCotacaoPet", { body: L.corpoSimulacao(pedido, null) })) as R.Simulado;
    };
    const tentar = (forma: 1 | 2, campanha: R.CampanhaOpcao | null) => simular(forma, campanha).catch(() => null);

    // Campanha vale por tipo de plano: só com todos os pets no mesmo tipo (igual ao widget).
    let opcoes: R.CampanhaOpcao[] = [];
    if (tipos.size === 1) {
      const [tipo] = [...tipos];
      const lista = L.campanhas(await api.plamev(
        `CampanhasCoberturas/BuscarCampanhasCoberturas?${q({ TiposCoberturasId: tipo, EstadosId: estado.id })}`, { cache: true },
      ));
      for (const c of lista.slice(0, MAX_CAMPANHAS)) {
        const tabelas = L.tabelas(await api.plamev(
          `CampanhasCoberturasTabelas/BuscarCampanhasCoberturasTabelas?${q({ CampanhasCoberturasId: c.id })}`, { cache: true },
        ));
        for (const t of tabelas) opcoes.push({ id: c.id, tabelaId: t.id, nome: tabelas.length > 1 ? `${c.nome} · ${t.nome}` : c.nome });
      }
      opcoes = opcoes.slice(0, MAX_CAMPANHAS);
    }

    const regra = R.campanhaConfigurada(settings, resumo[0].plano, opcoes);
    let campanha: R.CampanhaOpcao | null = null;
    let cartao: R.Simulado | null = null;
    if (regra.modo === "fixa") {
      campanha = regra.opcao;
      cartao = await tentar(2, campanha);
    } else if (regra.modo === "menor_preco" && opcoes.length) {
      const todas = await Promise.all([tentar(2, null), ...opcoes.map((o) => tentar(2, o))]);
      let melhor = -1;
      todas.forEach((s, i) => {
        if (s && s.totalMensalidade > 0 && (melhor < 0 || s.totalMensalidade < todas[melhor]!.totalMensalidade)) melhor = i;
      });
      if (melhor >= 0) { cartao = todas[melhor]; campanha = melhor === 0 ? null : opcoes[melhor - 1]; }
    } else {
      cartao = await tentar(2, null);
    }
    const boleto = await tentar(1, campanha);
    if (!cartao && !boleto) return { modelMessage: motivoDaFalha(null) };
    if ((cartao ?? boleto)!.totalMensalidade <= 0) return { modelMessage: "A Plamev não devolveu valor para essa simulação. Não fale em valores e passe a conversa para a equipe fazer a cotação." };

    const clientText = R.textoSimulacao({ pets: resumo, cartao, boleto, semCoparticipacao });
    console.log(`[plamev-agente] simulacao pets=${entrada.length} plano=${resumo[0].plano} campanha=${campanha?.nome ?? "-"} modo=${regra.modo}`);
    if (history.some((m) => m.role === "assistant" && m.content.trim() === clientText.trim())) {
      return { modelMessage: "Esta mesma simulação já foi mandada nesta conversa. Não mande de novo; responda a dúvida do cliente sem repetir a lista de valores." };
    }
    const valor = (s: R.Simulado | null) => (s ? R.brl(s.totalMensalidade) : "indisponível");
    return {
      clientText,
      teamNote: [
        "Simulação Plamev feita pelo agente (não é cotação gravada):",
        ...resumo.map((p, i) => `• ${p.nome || `Pet ${i + 1}`}: ${pets[i].especie === "gato" ? "gato" : "cachorro"}, ${typeof pets[i].raca === "string" && pets[i].raca ? pets[i].raca : "raça não informada"}, nascimento ${entrada[i].nascimento}, plano ${p.plano}`),
        `CEP ${cep} · campanha: ${campanha?.nome ?? "sem campanha"}`,
        `Cartão: ${valor(cartao)} por mês · Boleto/Pix: ${valor(boleto)} por mês`,
      ].join("\n"),
      modelMessage: [
        `A mensagem com os valores vai para o cliente logo depois do seu texto. Cartão de crédito: ${valor(cartao)} por mês. Boleto ou Pix: ${valor(boleto)} por mês.${entrada.length > 1 ? " É o total dos pets juntos." : ""}`,
        "Antes dela escreva só uma frase curta e, no fim, uma pergunta para seguir. Não repita os valores, não ofereça desconto além desse e não diga que o valor é só para hoje.",
        "É uma simulação: a cotação com o link de pagamento quem gera é a equipe, com os dados do cadastro.",
        ...avisos,
      ].join("\n"),
    };
  } catch (e) {
    return { modelMessage: motivoDaFalha(e) };
  }
}

// ───────────────────────────── Materiais de apoio ─────────────────────────────

/** Texto de todos os materiais de um plano cabe no pedido; a biblioteca inteira, não. */
const MAX_CHARS_LEITURA = 40_000;

const listaDeTitulos = (materiais: R.Material[]) =>
  materiais.map((m) => `- ${m.titulo} (${m.tipo === "image" ? "imagem" : "PDF"})`).join("\n");

export function rodarLerMateriais(args: { plano?: unknown }, materiais: R.Material[]): WidgetToolOutcome {
  const plano = typeof args?.plano === "string" ? args.plano.trim() : "";
  const doPlano = plano ? R.materiaisDoPlano(materiais, plano).filter((m) => m.conteudoMd) : [];
  // Sem plano (ou plano sem material): os comparativos, que não são de um plano só.
  const escolhidos = doPlano.length ? doPlano : materiais.filter((m) => m.conteudoMd && !m.titulo.includes(" - "));
  if (!escolhidos.length) {
    return { modelMessage: `Não há texto revisado ${plano ? `do plano "${plano}"` : "de materiais gerais"}. Não responda de memória: diga que vai confirmar e passe para a equipe. Materiais que existem:\n${listaDeTitulos(materiais)}` };
  }
  let resto = MAX_CHARS_LEITURA;
  const blocos: string[] = [];
  for (const m of escolhidos) {
    const texto = m.conteudoMd!.slice(0, resto);
    if (!texto) break;
    blocos.push(`### ${m.titulo}\n${texto}`);
    resto -= texto.length;
  }
  return {
    modelMessage: [
      plano && !doPlano.length ? `Não há material do plano "${plano}". Segue o material geral.` : "",
      "Texto oficial dos materiais da Plamev. Responda só com o que está aqui, em poucas linhas. Se a resposta não estiver aqui, diga que vai confirmar; não invente cobertura, carência nem limite. Não copie o material inteiro para o cliente.",
      ...blocos,
      `Outros materiais (use o plano para ler):\n${listaDeTitulos(materiais.filter((m) => !escolhidos.includes(m)))}`,
    ].filter(Boolean).join("\n\n"),
  };
}

export function rodarEnviarMaterial(
  args: { titulo?: unknown }, materiais: (R.Material & { url: string })[], history: WidgetToolContext["history"],
): WidgetToolOutcome {
  const dito = typeof args?.titulo === "string" ? args.titulo : "";
  const material = R.casarMaterial(materiais, dito);
  if (!material) return { modelMessage: `Não existe material com esse título. Use um destes títulos, exatamente:\n${listaDeTitulos(materiais)}` };
  // A legenda é o título: é por ela que o histórico mostra o que já foi enviado.
  if (history.some((m) => m.role === "assistant" && m.content.trim() === material.titulo)) {
    return { modelMessage: `"${material.titulo}" já foi enviado nesta conversa. Não envie de novo; se o cliente não achou, diga para subir a conversa.` };
  }
  return {
    clientMedia: [{ url: material.url, type: material.tipo, caption: material.titulo }],
    modelMessage: `"${material.titulo}" (${material.tipo === "image" ? "imagem" : "PDF"}) vai para o cliente logo depois do seu texto. Diga em uma frase o que está mandando. Não descreva o conteúdo além do que você leu no texto do material.`,
  };
}

// ───────────────────────────── Ligação com o servidor ─────────────────────────────

async function apiDaOrg(ctx: WidgetToolContext): Promise<PlamevApi | null> {
  // Só carrega o cliente (credenciais, rede) quando a ferramenta roda.
  const C = await import("../../../plamev-quote/client.ts");
  const token = await C.tokenDaOrg(ctx.supabase, ctx.organizationId);
  if (!token) return null;
  return {
    plamev: (path, init) => C.plamev(token, path, { body: init?.body, ...(init?.cache ? { cacheOrg: ctx.organizationId } : {}) }),
    rede: (cep, raio) => C.buscarRede(token, ctx.organizationId, cep, raio),
    enderecoDoCep: (cep) => C.enderecoDoCep(cep),
  };
}

const SEM_TOKEN: WidgetToolOutcome = { modelMessage: "A integração com a Plamev não está configurada nesta conta. Não invente a resposta; passe a conversa para a equipe." };

async function materiaisAtivos(ctx: WidgetToolContext): Promise<(R.Material & { url: string })[]> {
  const { data, error } = await ctx.supabase.from("plamev_materials")
    .select("id, titulo, tipo, storage_path, conteudo_md, md_status")
    .eq("ativo", true).is("removido_em", null).order("ordem", { ascending: true }).order("created_at", { ascending: true }).limit(100);
  if (error) throw new Error(`materiais: ${error.code}`);
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((m) => ({
    id: m.id, titulo: m.titulo, tipo: m.tipo,
    // O texto só vale depois de revisado (um erro de conversão viraria carência errada para o cliente).
    conteudoMd: m.md_status === "revisado" ? (m.conteudo_md ?? "").trim() || null : null,
    url: L.urlMaterial(base, m.storage_path),
  }));
}

const hojeEmSaoPaulo = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export const plamevRedeTool: WidgetAgentTool = {
  widgetKey: PLAMEV_WIDGET_KEY,
  name: PLAMEV_REDE_TOOL,
  description: "Consulta as clínicas credenciadas da Plamev perto do CEP do cliente e manda a lista das mais próximas para ele, igual à que a equipe manda. Use quando o cliente informar o CEP ou perguntar onde o plano atende. Sem o CEP, peça o CEP antes.",
  parameters: {
    type: "object",
    properties: { cep: { type: "string", description: "CEP do cliente, 8 números." } },
    required: ["cep"],
  },
  prompt: `
## PLAMEV: REDE CREDENCIADA
- Use **${PLAMEV_REDE_TOOL}** com o CEP do cliente antes de falar de valores. A lista das clínicas vai para o cliente depois do seu texto: não escreva nomes nem endereços de clínica por conta própria.
- Nunca diga que tem ou não tem clínica em uma cidade sem consultar. Se a ferramenta disser que não há rede perto, diga isso com honestidade e não ofereça plano.
`,
  async run(args, ctx) {
    const api = await apiDaOrg(ctx);
    return api ? rodarRede(args as { cep?: unknown }, api) : SEM_TOKEN;
  },
};

export const plamevSimularTool: WidgetAgentTool = {
  widgetKey: PLAMEV_WIDGET_KEY,
  name: PLAMEV_SIMULAR_TOOL,
  description: "Simula o valor de um plano da Plamev para os pets do cliente (não grava cotação) e manda a mensagem com os valores no cartão e no boleto. Precisa do CEP, do plano e, de cada pet, se é cachorro ou gato, a raça e a idade ou data de nascimento. Com mais de um pet, passe todos juntos: o desconto do segundo pet já entra.",
  parameters: {
    type: "object",
    properties: {
      cep: { type: "string", description: "CEP do cliente, 8 números." },
      plano: { type: "string", description: 'Nome do plano, por exemplo "Slim", "Slim Essencial", "Advance", "Advance Plus", "Platinum", "Diamond".' },
      pets: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome do pet." },
            especie: { type: "string", enum: ["cao", "gato"] },
            raca: { type: "string", description: 'Raça como o cliente disse. Sem raça definida: "SRD".' },
            nascimento: { type: "string", description: "Data de nascimento, AAAA-MM-DD, se o cliente informou." },
            idade_meses: { type: "number", description: "Idade em meses, quando não há data de nascimento (2 anos = 24)." },
          },
          required: ["especie"],
        },
      },
    },
    required: ["cep", "plano", "pets"],
  },
  prompt: `
## PLAMEV: VALORES
- Valor de plano só sai de **${PLAMEV_SIMULAR_TOOL}**. Nunca escreva preço, desconto ou promoção por conta própria, nem os valores que aparecem nos materiais ou no anúncio.
- Chame quando souber o CEP, o plano e, de cada pet, espécie, raça e idade (ou data de nascimento). Se a ferramenta disser o que falta, pergunte só isso.
- A mensagem com os valores vai depois do seu texto. Não repita os valores, não prometa desconto maior e não diga que a condição é só para hoje.
- A simulação não é a cotação: a cotação com o link de pagamento é feita pela equipe.
`,
  async run(args, ctx) {
    const api = await apiDaOrg(ctx);
    return api ? rodarSimulacao((args ?? {}) as SimulacaoArgs, api, ctx.settings, hojeEmSaoPaulo(), ctx.history) : SEM_TOKEN;
  },
};

export const plamevLerMateriaisTool: WidgetAgentTool = {
  widgetKey: PLAMEV_WIDGET_KEY,
  name: PLAMEV_LER_MATERIAL_TOOL,
  description: "Devolve o texto oficial dos materiais de um plano da Plamev (cobertura, carências, limites). Use antes de responder qualquer dúvida de cobertura, carência ou limite. Sem plano, devolve o comparativo dos planos.",
  parameters: {
    type: "object",
    properties: { plano: { type: "string", description: 'Nome do plano, por exemplo "Advance". Vazio para o comparativo dos planos.' } },
  },
  prompt: `
## PLAMEV: COBERTURA E CARÊNCIA
- Antes de responder sobre cobertura, carência, limite de uso ou o que cada plano inclui, leia o material com **${PLAMEV_LER_MATERIAL_TOOL}** e responda só com o que está nele, em poucas linhas.
- Se não estiver no material, diga que vai confirmar com a equipe. Nunca invente cobertura, carência ou redução de carência.
`,
  async run(args, ctx) {
    return rodarLerMateriais(args as { plano?: unknown }, await materiaisAtivos(ctx));
  },
};

export const plamevEnviarMaterialTool: WidgetAgentTool = {
  widgetKey: PLAMEV_WIDGET_KEY,
  name: PLAMEV_ENVIAR_MATERIAL_TOOL,
  description: 'Envia ao cliente um material de apoio da Plamev: a imagem de resumo de um plano ("Resumo - Advance"), o PDF da cobertura com as carências ("Cobertura - Advance") ou a imagem que compara os planos ("Comparativos 3 Planos"). Um material por chamada.',
  parameters: {
    type: "object",
    properties: { titulo: { type: "string", description: 'Título do material, por exemplo "Resumo - Slim Essencial" ou "Cobertura - Platinum".' } },
    required: ["titulo"],
  },
  prompt: `
## PLAMEV: MATERIAIS
- Use **${PLAMEV_ENVIAR_MATERIAL_TOOL}** para mandar a imagem ou o PDF: "Resumo - <plano>" (imagem) ao apresentar um plano, "Comparativos 3 Planos" (imagem) quando o cliente quer comparar, "Cobertura - <plano>" (PDF) quando ele pede os detalhes ou as carências.
- Mande o material do plano e da espécie do pet do cliente. Um material por vez, e nunca o mesmo duas vezes.
`,
  async run(args, ctx) {
    return rodarEnviarMaterial(args as { titulo?: unknown }, await materiaisAtivos(ctx), ctx.history);
  },
};

export const plamevAgentTools: WidgetAgentTool[] = [plamevRedeTool, plamevSimularTool, plamevLerMateriaisTool, plamevEnviarMaterialTool];
