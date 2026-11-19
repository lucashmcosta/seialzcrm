import { describe, expect, it } from "vitest";
import {
  type CompromissoRow,
  dataSimples,
  faltam,
  faseLabel,
  horaEmOutroFuso,
  linkSeguro,
  modalidadeLabel,
  ondeEsta,
  proximosCompromissos,
  quandoCompromisso,
  tipoCompromisso,
} from "./nammuxProcessView";

const base: CompromissoRow = {
  external_event_id: "e1",
  event_type: "audiencia",
  subtype: null,
  status: "pendente",
  start_at: "2026-12-10T13:00:00Z",
  end_at: null,
  all_day: false,
  timezone: "America/Sao_Paulo",
  modality: null,
  location: null,
  virtual_link: null,
  removed_at: null,
};

describe("rótulos", () => {
  it("fase vira português e desconhecida passa como veio", () => {
    expect(faseLabel("PRE_JUDICIAL")).toBe("Pré-judicial");
    expect(faseLabel("judicial")).toBe("Judicial");
    expect(faseLabel("OUTRA")).toBe("OUTRA");
    expect(faseLabel(null)).toBeNull();
  });

  it("onde está junta fase, etapa e situação sem repetir", () => {
    expect(ondeEsta("JUDICIAL", "Conhecimento", "Ativo")).toBe("Judicial · Conhecimento · Ativo");
    expect(ondeEsta("JUDICIAL", "Judicial", "Ativo")).toBe("Judicial · Ativo");
    expect(ondeEsta(null, null, null)).toBe("Sem informação");
  });

  it("tipo do compromisso com e sem subtipo", () => {
    expect(tipoCompromisso("audiencia", "Instrução")).toBe("Audiência · Instrução");
    expect(tipoCompromisso("pericia", null)).toBe("Perícia");
    expect(tipoCompromisso("audiencia", "audiência")).toBe("Audiência");
    expect(tipoCompromisso("outro", null)).toBe("Compromisso");
  });

  it("modalidade conhecida vira rótulo; desconhecida some", () => {
    expect(modalidadeLabel("virtual")).toBe("Virtual");
    expect(modalidadeLabel("PRESENCIAL")).toBe("Presencial");
    expect(modalidadeLabel("xyz")).toBeNull();
    expect(modalidadeLabel(null)).toBeNull();
  });
});

describe("data do compromisso", () => {
  it("sai no fuso do compromisso, não no do navegador", () => {
    // 13:00 UTC = 10:00 em São Paulo
    expect(quandoCompromisso(base)).toMatch(/10\/12\/2026 às 10:00$/);
    // o mesmo instante em Manaus (UTC-4) é 09:00
    expect(quandoCompromisso({ ...base, timezone: "America/Manaus" })).toMatch(/às 09:00$/);
  });

  it("dia inteiro não volta um dia e não mostra hora", () => {
    const r = { ...base, all_day: true, start_at: "2026-12-10T00:00:00Z" };
    expect(quandoCompromisso(r)).toMatch(/10\/12\/2026 \(dia inteiro\)$/);
  });

  it("fuso inválido cai em São Paulo; data inválida não quebra", () => {
    expect(quandoCompromisso({ ...base, timezone: "Nao/Existe" })).toMatch(/às 10:00$/);
    expect(quandoCompromisso({ ...base, start_at: "lixo" })).toBe("Data não informada");
  });

  it("faltam: hoje, amanhã e em N dias, por dia de calendário", () => {
    expect(faltam(base, new Date("2026-12-10T03:30:00Z"))).toBe("hoje"); // 00:30 em SP do dia 10
    expect(faltam(base, new Date("2026-12-09T15:00:00Z"))).toBe("amanhã");
    expect(faltam(base, new Date("2026-11-28T15:00:00Z"))).toBe("em 12 dias");
    expect(faltam(base, new Date("2026-12-11T15:00:00Z"))).toBe("");
  });
});

describe("tribunal em outro fuso", () => {
  it("devolve o rótulo e a hora de Brasília", () => {
    // 13:00 UTC = 09:00 em Cuiabá = 10:00 em Brasília
    expect(horaEmOutroFuso({ ...base, timezone: "America/Cuiaba" })).toEqual({ rotulo: "horário de Cuiabá", brasilia: "10:00" });
    expect(horaEmOutroFuso({ ...base, timezone: "America/Rio_Branco" })?.rotulo).toBe("horário de Rio Branco");
    expect(horaEmOutroFuso({ ...base, timezone: "America/Boa_Vista" })).toEqual({ rotulo: "horário local", brasilia: "10:00" });
  });

  it("não aparece em Brasília, em fuso de mesma hora, dia inteiro, sem fuso ou fuso inválido", () => {
    expect(horaEmOutroFuso(base)).toBeNull();
    expect(horaEmOutroFuso({ ...base, timezone: "America/Bahia" })).toBeNull();
    expect(horaEmOutroFuso({ ...base, timezone: "America/Cuiaba", all_day: true })).toBeNull();
    expect(horaEmOutroFuso({ ...base, timezone: null })).toBeNull();
    expect(horaEmOutroFuso({ ...base, timezone: "Nao/Existe" })).toBeNull();
  });
});

describe("próximos compromissos", () => {
  const agora = new Date("2026-12-10T20:00:00Z"); // 17:00 em SP do dia 10

  it("mantém o de hoje mesmo já passado da hora, tira o de ontem", () => {
    const hojeCedo = { ...base, external_event_id: "hoje", start_at: "2026-12-10T12:00:00Z" };
    const ontem = { ...base, external_event_id: "ontem", start_at: "2026-12-09T12:00:00Z" };
    const futuro = { ...base, external_event_id: "futuro", start_at: "2027-01-15T12:00:00Z" };
    expect(proximosCompromissos([futuro, ontem, hojeCedo], agora).map((r) => r.external_event_id)).toEqual(["hoje", "futuro"]);
  });

  it("tira cancelado, concluído e removido", () => {
    const futuro = "2027-01-15T12:00:00Z";
    const rows = [
      { ...base, external_event_id: "ok", start_at: futuro },
      { ...base, external_event_id: "cancelado", start_at: futuro, status: "cancelado" },
      { ...base, external_event_id: "concluido", start_at: futuro, status: "concluido" },
      { ...base, external_event_id: "removido", start_at: futuro, removed_at: "2026-12-01T00:00:00Z" },
    ];
    expect(proximosCompromissos(rows, agora).map((r) => r.external_event_id)).toEqual(["ok"]);
  });

  it("ordena do mais próximo para o mais distante", () => {
    const a = { ...base, external_event_id: "a", start_at: "2027-03-01T12:00:00Z" };
    const b = { ...base, external_event_id: "b", start_at: "2027-01-01T12:00:00Z" };
    expect(proximosCompromissos([a, b], agora).map((r) => r.external_event_id)).toEqual(["b", "a"]);
  });
});

describe("link e data simples", () => {
  it("só aceita http e https", () => {
    expect(linkSeguro("https://meet.exemplo.com/abc")).toBe("https://meet.exemplo.com/abc");
    expect(linkSeguro("javascript:alert(1)")).toBeNull();
    expect(linkSeguro("sala 3")).toBeNull();
    expect(linkSeguro(null)).toBeNull();
  });

  it("conserta link digitado com espaço e separa ID/senha", () => {
    expect(linkSeguro("https://trt15-jus-br.zoom.us/j/123? pwd=abc")).toBe("https://trt15-jus-br.zoom.us/j/123?pwd=abc");
    expect(linkSeguro("https://x.zoom.us/j/1?pwd=a.1 ID da reunião: 835 Senha: 4vt")).toBe("https://x.zoom.us/j/1?pwd=a.1");
  });

  it("data sem hora não volta um dia", () => {
    expect(dataSimples("2026-05-21")).toBe("21/05/2026");
    expect(dataSimples(null)).toBeNull();
  });
});
