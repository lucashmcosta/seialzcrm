import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  agendaWhen,
  day,
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

type Row = Record<string, unknown>;

// Cliente em memória: registra as tabelas consultadas e devolve as linhas dadas.
function fakeSupabase(tables: Record<string, Row[]>, queried: string[] = []) {
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

Deno.test("flag desligada: texto original e a agenda nem é consultada", async () => {
  const consultadas: string[] = [];
  const db = fakeSupabase({
    opportunities: [{ id: "opp-1" }],
    nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }],
    nammux_process_events: [{ opportunity_id: "opp-1", event_type: "audiencia", start_at: "2026-12-10T13:00:00Z" }],
  }, consultadas);
  const texto = await nammuxSupportContext(db, "org", "contato", () => Promise.resolve(false));
  assertEquals(texto, BLOCO_ORIGINAL);
  assertEquals(consultadas.includes("nammux_process_events"), false);
});

Deno.test("flag da agenda ligada: bloco de datas entra e o aviso muda", async () => {
  const flags: string[] = [];
  const db = fakeSupabase({
    opportunities: [{ id: "opp-1" }],
    nammux_process_snapshots: [{ ...PROCESSO, opportunity_id: "opp-1" }],
    nammux_process_events: [{
      opportunity_id: "opp-1", event_type: "audiencia", subtype: null,
      start_at: "2026-12-10T13:00:00Z", all_day: false, timezone: "America/Sao_Paulo",
      modality: null, location: null, virtual_link: null,
    }],
  });
  const texto = await nammuxSupportContext(db, "org", "contato", (flag) => {
    flags.push(flag);
    return Promise.resolve(flag === NAMMUX_AGENT_AGENDA_FLAG);
  });
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
