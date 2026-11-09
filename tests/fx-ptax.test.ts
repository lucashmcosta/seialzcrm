import { assertEquals, assert } from "jsr:@std/assert@1";
import { cotacaoDoDia, converterGasto, lerPtax, ptaxUrl } from "../supabase/functions/_shared/fx/ptax.ts";

const cotacoes = [
  { rate_date: "2026-11-05", rate_brl: 5.4621 },
  { rate_date: "2026-11-06", rate_brl: 5.5013 },
];

Deno.test("lê a resposta do Banco Central e ignora linha ruim", () => {
  assertEquals(lerPtax({ value: [
    { cotacaoVenda: 5.5013, dataHoraCotacao: "2026-11-06 13:06:13.966" },
    { cotacaoVenda: 0, dataHoraCotacao: "2026-11-07 13:00:00" },
    { cotacaoVenda: 5.5, dataHoraCotacao: null },
  ] }), [{ rate_date: "2026-11-06", rate_brl: 5.5013 }]);
  assertEquals(lerPtax({}), []);
  assertEquals(lerPtax(null), []);
});

Deno.test("URL usa data no formato do Banco Central e o boletim de fechamento", () => {
  const url = decodeURIComponent(ptaxUrl("USD", "2026-11-02", "2026-11-09"));
  assert(url.includes("@moeda='USD'"));
  assert(url.includes("@dataInicial='11-02-2026'"));
  assert(url.includes("@dataFinalCotacao='11-09-2026'"));
  assert(url.includes("tipoBoletim eq 'Fechamento'"));
});

Deno.test("fim de semana usa o último dia útil; sem cotação recente não inventa", () => {
  assertEquals(cotacaoDoDia(cotacoes, "2026-11-06")?.rate_brl, 5.5013);
  assertEquals(cotacaoDoDia(cotacoes, "2026-11-08")?.rate_date, "2026-11-06");
  assertEquals(cotacaoDoDia(cotacoes, "2026-11-04"), null);
  assertEquals(cotacaoDoDia(cotacoes, "2026-11-20"), null);
});

Deno.test("o caso real: US$ 95,19 não vira R$ 95,19", () => {
  const r = converterGasto({ centavos: 9519, moedaConta: "USD", moedaOrg: "BRL", data: "2026-11-08", cotacoes });
  assertEquals(r, { ok: true, spend_cents: 52367, fx_rate: 5.5013, fx_rate_date: "2026-11-06" });
});

Deno.test("mesma moeda não muda nada nem precisa de cotação", () => {
  assertEquals(converterGasto({ centavos: 100, moedaConta: "BRL", moedaOrg: "BRL", data: "2026-11-08", cotacoes: [] }),
    { ok: true, spend_cents: 100, fx_rate: 1, fx_rate_date: null });
});

Deno.test("sem cotação não converte: quem chama não grava 1:1", () => {
  assertEquals(converterGasto({ centavos: 100, moedaConta: "USD", moedaOrg: "BRL", data: "2026-11-08", cotacoes: [] }),
    { ok: false, motivo: "sem_cotacao" });
  assertEquals(converterGasto({ centavos: 100, moedaConta: "BRL", moedaOrg: "USD", data: "2026-11-08", cotacoes }),
    { ok: false, motivo: "moeda_da_org_sem_ptax" });
});
