import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  agendaWhen,
  brl,
  day,
  NAMMUX_AGENT_FINANCE_FLAG,
  NAMMUX_AGENT_MOVEMENTS_FLAG,
  nammuxTimelineBlock,
  nammuxFinanceBlock,
  type NammuxFinanceRow,
  NAMMUX_AGENT_AGENDA_FLAG,
  nammuxAgendaBlock,
  nammuxContextForAgent,
  nammuxProcessBlock,
  nammuxSupportContext,
  type NammuxProcessRow,
} from "./nammux-process-context.ts";

const PROCESSO: NammuxProcessRow = {
  cnj: "0000000-00.2026.5.02.0001",
  process_title: "Reclamação trabalhista",
  phase: null,
  stage_name: "Instrução",
  status_name: "Aguardando audiência",
  status_changed_at: "2026-11-01T12:00:00Z",
  responsible_name: "Equipe",
  distributed_at: "2026-10-01",
  source_updated_at: "2026-11-10T12:00:00Z",
  last_synced_at: null,
};

// O texto que o agente recebia antes dos blocos novos. Com a flag desligada ele
// continua o mesmo, com uma única diferença: a data de distribuição (campo
// só-data) saía um dia antes, e agora sai certa.
const BLOCO_ORIGINAL = `
## PROCESSOS DO CLIENTE (sistema do escritório)
- 1. Reclamação trabalhista · número 0000000-00.2026.5.02.0001 · etapa: Instrução · situação: Aguardando audiência · desde 01/11/2026 · distribuído em 01/10/2026 · responsável no escritório: Equipe · atualizado no sistema em 10/11/2026
Use só estes dados para falar do processo. Se o cliente perguntar algo que não está aqui (data de audiência, link, valor, pagamento, movimentação do tribunal), não invente: diga o que você sabe e passe para a equipe.
`;

// Cliente em memória: registra as tabelas consultadas e devolve as linhas dadas.
function fakeSupabase(tables: Record<string, unknown[]>, queried: string[] = []) {
  return {
    from(table: string) {
      queried.push(table);
      const rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "gte", "order"]) builder[m] = () => builder;
      builder.limit = () => Promise.resolve({ data: rows, error: null });
      return builder;
    },
  };
}

Deno.test("campo só-data não volta um dia por causa do fuso", () => {
  assertEquals(day("2026-10-01"), "01/10/2026");
  // Com hora, vale o dia em Brasília: 01:00 UTC do dia 2 ainda é dia 1.
  assertEquals(day("2026-10-02T01:00:00Z"), "01/10/2026");
  assertEquals(day("2026-10-02T12:00:00Z"), "02/10/2026");
  assertEquals(day(null), null);
  assertEquals(day("lixo"), null);
});

Deno.test("bloco de processos sem flag é o texto de antes", () => {
  assertEquals(nammuxProcessBlock([PROCESSO]), BLOCO_ORIGINAL);
  assertEquals(nammuxProcessBlock([]), "");
});

Deno.test("assunto coberto por bloco próprio sai do aviso de 'não invente'", () => {
  const texto = nammuxProcessBlock([PROCESSO], { agenda: true });
  assertStringIncludes(texto, "(valor, pagamento, movimentação do tribunal), não invente");
  assertEquals(texto.includes("data de audiência"), false);
  const tudo = nammuxProcessBlock([PROCESSO], { agenda: true, finance: true, movements: true });
  assertStringIncludes(tudo, "algo que não está aqui, não invente");
});

Deno.test("data da agenda sai no horário de Brasília, com dia da semana", () => {
  // 13:00 UTC = 10:00 em Brasília
  assertEquals(
    agendaWhen("2026-12-10T13:00:00Z", false, "America/Sao_Paulo"),
    "quinta-feira, 10/12/2026 às 10:00 (horário de Brasília)",
  );
  assertEquals(
    agendaWhen("2026-12-10T03:00:00Z", true, null),
    "quinta-feira, 10/12/2026 (horário ainda não definido)",
  );
  // 01:30 UTC ainda é dia 9 em Brasília
  assertEquals(
    agendaWhen("2026-12-10T01:30:00Z", false, null),
    "quarta-feira, 09/12/2026 às 22:30 (horário de Brasília)",
  );
  assertEquals(agendaWhen("não é data", false, null), null);
});

Deno.test("bloco da agenda lista as datas e diz quando não há nenhuma", () => {
  const bloco = nammuxAgendaBlock([{
    opportunity_id: "opp-1", event_type: "audiencia", subtype: "Instrução",
    start_at: "2026-12-10T13:00:00Z", all_day: false, timezone: "America/Sao_Paulo",
    modality: "virtual", location: null, virtual_link: "https://exemplo.invalid/sala",
  }, {
    opportunity_id: "opp-1", event_type: "pericia", subtype: null,
    start_at: "2026-12-15T03:00:00Z", all_day: true, timezone: null,
    modality: "presencial", location: "Fórum, sala 3", virtual_link: null,
  }]);
  assertStringIncludes(bloco, "## PRÓXIMAS DATAS DO PROCESSO");
  assertStringIncludes(bloco, "- Audiência (Instrução) · quinta-feira, 10/12/2026 às 10:00 (horário de Brasília) · modalidade: virtual · link: https://exemplo.invalid/sala");
  assertStringIncludes(bloco, "- Perícia · terça-feira, 15/12/2026 (horário ainda não definido) · modalidade: presencial · local: Fórum, sala 3");
  assertEquals(bloco.includes("processo 1"), false); // um processo só: não numera

  const vazio = nammuxAgendaBlock([]);
  assertStringIncludes(vazio, "Não há audiência, perícia ou entrevista marcada no momento");
});

Deno.test("com mais de um processo, a data diz de qual processo é", () => {
  const bloco = nammuxAgendaBlock([{
    opportunity_id: "opp-2", event_type: "entrevista", subtype: null,
    start_at: "2026-12-10T13:00:00Z", all_day: false, timezone: null,
    modality: null, location: null, virtual_link: null,
  }], { "opp-1": 1, "opp-2": 2 });
  assertStringIncludes(bloco, "- Entrevista · quinta-feira, 10/12/2026 às 10:00 (horário de Brasília) · processo 2");
});

Deno.test("agente comercial não recebe nada e nem consulta o banco", async () => {
  for (const tipo of ["sdr", "SDR", "Support", "support ", "", null, undefined, "closer"]) {
    let chamou = false;
    const texto = await nammuxContextForAgent(tipo, () => { chamou = true; return Promise.resolve("DADO DO NAMMUX"); });
    assertEquals(texto, "", `tipo ${String(tipo)} recebeu contexto`);
    assertEquals(chamou, false, `tipo ${String(tipo)} consultou o banco`);
  }
  assertEquals(await nammuxContextForAgent("support", () => Promise.resolve("DADO")), "DADO");
});

const AGENDA_NAMMUX = {
  agenda: [{
    opportunity_id: "opp-1", event_type: "audiencia", subtype: null,
    start_at: "2026-12-10T13:00:00Z", all_day: false, timezone: "America/Sao_Paulo",
    modality: null, location: null, virtual_link: null,
  }],
  timeline: [],
};

Deno.test("flag desligada: texto original e o Nammux nem é consultado", async () => {
  let chamadas = 0;
  const db = fakeSupabase({ opportunities: [{ id: "opp-1" }], nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }] });
  const texto = await nammuxSupportContext(db, "org", "contato", () => Promise.resolve(false), new Date(), () => { chamadas++; return Promise.resolve(AGENDA_NAMMUX); });
  assertEquals(texto, BLOCO_ORIGINAL);
  assertEquals(chamadas, 0);
});

Deno.test("Nammux fora do ar: sem datas e o agente passa para a equipe", async () => {
  const db = fakeSupabase({ opportunities: [{ id: "opp-1" }], nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }] });
  const texto = await nammuxSupportContext(db, "org", "contato", (f) => Promise.resolve(f === NAMMUX_AGENT_AGENDA_FLAG), new Date(), () => Promise.resolve(null));
  assertStringIncludes(texto, "Não foi possível consultar o sistema do escritório agora");
  assertEquals(texto.includes("## PRÓXIMAS DATAS DO PROCESSO"), false);
  assertStringIncludes(texto, "(data de audiência, link,");
});

Deno.test("flag da agenda ligada: datas vêm da consulta ao Nammux e o aviso muda", async () => {
  const flags: string[] = [];
  const pedidos: string[][] = [];
  const db = fakeSupabase({ opportunities: [{ id: "opp-1" }], nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }] });
  const texto = await nammuxSupportContext(db, "org", "contato", (flag) => {
    flags.push(flag);
    return Promise.resolve(flag === NAMMUX_AGENT_AGENDA_FLAG);
  }, new Date(), (ids, include) => { pedidos.push([...ids, ...include]); return Promise.resolve(AGENDA_NAMMUX); });
  assertEquals(pedidos, [["opp-1", "agenda"]]);
  assertStringIncludes(texto, "## PROCESSOS DO CLIENTE");
  assertStringIncludes(texto, "## PRÓXIMAS DATAS DO PROCESSO");
  assertStringIncludes(texto, "- Audiência · quinta-feira, 10/12/2026 às 10:00 (horário de Brasília)");
  assertEquals(texto.includes("(data de audiência, link,"), false);
  assertEquals(flags.includes(NAMMUX_AGENT_AGENDA_FLAG), true);
});

Deno.test("contato sem negócio ou sem processo: contexto vazio", async () => {
  assertEquals(await nammuxSupportContext(fakeSupabase({}), "org", "c", () => Promise.resolve(true)), "");
  assertEquals(
    await nammuxSupportContext(fakeSupabase({ opportunities: [{ id: "opp-1" }] }), "org", "c", () => Promise.resolve(true)),
    "",
  );
});

const VAZIO: NammuxFinanceRow = {
  opportunity_id: "opp-1", kind: "agreement", external_id: "", parent_external_id: null, status: null,
  agreed_on: null, homologated_on: null, installments_count: null, number: null, due_date: null,
  effective_due_date: null, client_amount: null, paid_on: null, manifestation_due_date: null, amount: null, reversed: null,
};
const FINANCEIRO: NammuxFinanceRow[] = [
  { ...VAZIO, kind: "agreement", external_id: "ac-1", status: "vigente", agreed_on: "2026-10-01", homologated_on: "2026-10-08", installments_count: 3 },
  { ...VAZIO, kind: "installment", external_id: "pa-2", parent_external_id: "ac-1", number: 2, status: "overdue", due_date: "2026-11-05", client_amount: "700.00", manifestation_due_date: "2026-11-13" },
  { ...VAZIO, kind: "installment", external_id: "pa-1", parent_external_id: "ac-1", number: 1, status: "paid", due_date: "2026-10-05", client_amount: 700, paid_on: "2026-10-04" },
  { ...VAZIO, kind: "installment", external_id: "pa-3", parent_external_id: "ac-1", number: 3, status: "open", due_date: "2026-12-05", client_amount: 1400.5 },
  { ...VAZIO, kind: "payout", external_id: "rp-1", amount: "700.00", paid_on: "2026-10-10", reversed: false },
  { ...VAZIO, kind: "payout", external_id: "rp-2", amount: "50.00", paid_on: "2026-10-11", reversed: true },
];

Deno.test("valor em reais", () => {
  assertEquals(brl(1400.5), "R$ 1.400,50");
  assertEquals(brl("700.00"), "R$ 700,00");
  assertEquals(brl(null), null);
  assertEquals(brl("abc"), null);
});

Deno.test("bloco do financeiro: acordo, parcelas em ordem e repasse não estornado", () => {
  const bloco = nammuxFinanceBlock(FINANCEIRO);
  assertStringIncludes(bloco, "## ACORDO E PAGAMENTOS");
  assertStringIncludes(bloco, "- Acordo fechado em 01/10/2026 · homologado pelo juiz em 08/10/2026 · 3 parcelas");
  assertStringIncludes(bloco, "  - Parcela 1 de 3 · vencimento 05/10/2026 · paga em 04/10/2026 · parte do cliente: R$ 700,00");
  assertStringIncludes(bloco, "  - Parcela 2 de 3 · vencimento 05/11/2026 · venceu e não foi paga; o escritório vai se manifestar no processo até 13/11/2026 · parte do cliente: R$ 700,00");
  assertStringIncludes(bloco, "  - Parcela 3 de 3 · vencimento 05/12/2026 · ainda não venceu · parte do cliente: R$ 1.400,50");
  assertStringIncludes(bloco, "- Repasse ao cliente · R$ 700,00 · em 10/10/2026");
  // parcelas na ordem do número, não na de chegada
  assertEquals(bloco.indexOf("Parcela 1 de 3") < bloco.indexOf("Parcela 2 de 3"), true);
  // repasse estornado não aparece
  assertEquals(bloco.includes("R$ 50,00"), false);
  assertEquals(nammuxFinanceBlock([]), "");
});

Deno.test("financeiro só entra com a flag dele; sem acordo, valor continua no 'não invente'", async () => {
  const tabelas = {
    opportunities: [{ id: "opp-1" }],
    nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }],
    nammux_process_finance: FINANCEIRO,
  };
  const consultadas: string[] = [];
  const sem = await nammuxSupportContext(fakeSupabase(tabelas, consultadas), "org", "c", () => Promise.resolve(false));
  assertEquals(sem.includes("ACORDO E PAGAMENTOS"), false);
  assertEquals(consultadas.includes("nammux_process_finance"), false);

  const com = await nammuxSupportContext(fakeSupabase(tabelas), "org", "c", (f) => Promise.resolve(f === NAMMUX_AGENT_FINANCE_FLAG));
  assertStringIncludes(com, "## ACORDO E PAGAMENTOS");
  assertStringIncludes(com, "(data de audiência, link, movimentação do tribunal), não invente");

  const semAcordo = await nammuxSupportContext(
    fakeSupabase({ ...tabelas, nammux_process_finance: [] }), "org", "c", (f) => Promise.resolve(f === NAMMUX_AGENT_FINANCE_FLAG));
  assertEquals(semAcordo.includes("ACORDO E PAGAMENTOS"), false);
  assertStringIncludes(semAcordo, "(data de audiência, link, valor, pagamento, movimentação do tribunal), não invente");
});

Deno.test("andamento: título e explicação do catálogo; linha sensível só com o título", () => {
  const bloco = nammuxTimelineBlock([
    { opportunity_id: "opp-1", at: "2026-11-18T15:00:00Z", title: "O processo foi para o juiz decidir", description: "Não é preciso fazer nada agora.", attention: false },
    { opportunity_id: "opp-1", at: "2026-11-10T01:00:00Z", title: "Sentença: os pedidos foram negados", description: "Ainda pode caber recurso.", attention: true },
  ]);
  assertStringIncludes(bloco, "## ANDAMENTO DO PROCESSO");
  assertStringIncludes(bloco, "- 18/11/2026: O processo foi para o juiz decidir — Não é preciso fazer nada agora.");
  // 01:00 UTC do dia 10 ainda é dia 9 em Brasília; sensível sai sem a explicação
  assertStringIncludes(bloco, "- 09/11/2026: Sentença: os pedidos foram negados [SENSÍVEL]");
  assertEquals(bloco.includes("Ainda pode caber recurso"), false);
  assertEquals(nammuxTimelineBlock([]), "");
});

Deno.test("andamento só com a flag dele; sem nenhum item, o agente diz que não há novidade", async () => {
  const db = () => fakeSupabase({ opportunities: [{ id: "opp-1" }], nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }] });
  const comItem = { agenda: [], timeline: [{ opportunity_id: "opp-1", at: "2026-11-18T15:00:00Z", title: "O laudo da perícia foi publicado", description: null, attention: false }] };
  const sem = await nammuxSupportContext(db(), "org", "c", () => Promise.resolve(false), new Date(), () => Promise.resolve(comItem));
  assertEquals(sem.includes("ANDAMENTO DO PROCESSO"), false);

  const com = await nammuxSupportContext(db(), "org", "c", (f) => Promise.resolve(f === NAMMUX_AGENT_MOVEMENTS_FLAG), new Date(), () => Promise.resolve(comItem));
  assertStringIncludes(com, "- 18/11/2026: O laudo da perícia foi publicado");

  const vazio = await nammuxSupportContext(db(), "org", "c", (f) => Promise.resolve(f === NAMMUX_AGENT_MOVEMENTS_FLAG), new Date(), () => Promise.resolve({ agenda: [], timeline: [] }));
  assertStringIncludes(vazio, "Não há movimentação registrada nos últimos 90 dias");
});

Deno.test("com as três flags ligadas, os três blocos entram e o aviso fica sem lista", async () => {
  const texto = await nammuxSupportContext(fakeSupabase({
    opportunities: [{ id: "opp-1" }],
    nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }],
    nammux_process_finance: FINANCEIRO,
  }), "org", "c", () => Promise.resolve(true), new Date(), () => Promise.resolve({ agenda: [], timeline: [] }));
  for (const titulo of ["## PROCESSOS DO CLIENTE", "## PRÓXIMAS DATAS DO PROCESSO", "## ACORDO E PAGAMENTOS", "## ANDAMENTO DO PROCESSO"]) {
    assertStringIncludes(texto, titulo);
  }
  assertStringIncludes(texto, "algo que não está aqui, não invente");
});

Deno.test("tribunal em outro fuso: hora local com a de Brasília ao lado", () => {
  // 13:00 UTC = 09:00 em Cuiabá = 10:00 em Brasília
  assertEquals(
    agendaWhen("2026-12-10T13:00:00Z", false, "America/Cuiaba"),
    "quinta-feira, 10/12/2026 às 09:00 (horário de Cuiabá; 10:00 no horário de Brasília)",
  );
  assertEquals(
    agendaWhen("2026-12-10T13:00:00Z", false, "America/Rio_Branco"),
    "quinta-feira, 10/12/2026 às 08:00 (horário de Rio Branco; 10:00 no horário de Brasília)",
  );
  // fuso desconhecido não quebra: cai em Brasília
  assertEquals(
    agendaWhen("2026-12-10T13:00:00Z", false, "Nao/Existe"),
    "quinta-feira, 10/12/2026 às 10:00 (horário de Brasília)",
  );
});
