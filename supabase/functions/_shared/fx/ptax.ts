// Cotação PTAX do Banco Central (venda, boletim de fechamento), de graça e oficial, para converter o gasto de contas de
// anúncio em moeda diferente da org. A PTAX só cota contra o real. Sem cotação não há conversão: quem chama não grava,
// porque gravar 1:1 faria US$ 95 parecer R$ 95. Regras puras em tests/fx-ptax.test.ts.

export type FxRate = { rate_date: string; rate_brl: number };

const BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
// Fim de semana e feriado não têm boletim: vale o último dia útil. Mais que isso é falha, não cotação.
const MAX_DIAS_ATRAS = 7;

const paraMmDdAaaa = (iso: string) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;

export function ptaxUrl(moeda: string, de: string, ate: string): string {
  return `${BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${encodeURIComponent(moeda)}'&@dataInicial='${paraMmDdAaaa(de)}'&@dataFinalCotacao='${paraMmDdAaaa(ate)}'` +
    `&$format=json&$filter=${encodeURIComponent("tipoBoletim eq 'Fechamento'")}&$select=cotacaoVenda,dataHoraCotacao`;
}

export function lerPtax(body: unknown): FxRate[] {
  const linhas = (body as { value?: Array<{ cotacaoVenda?: unknown; dataHoraCotacao?: unknown }> })?.value;
  if (!Array.isArray(linhas)) return [];
  return linhas.flatMap((l) => {
    const taxa = Number(l.cotacaoVenda);
    const data = typeof l.dataHoraCotacao === "string" ? l.dataHoraCotacao.slice(0, 10) : "";
    return taxa > 0 && /^\d{4}-\d{2}-\d{2}$/.test(data) ? [{ rate_date: data, rate_brl: taxa }] : [];
  });
}

/** Cotação do dia ou do último dia útil antes dele. */
export function cotacaoDoDia(cotacoes: FxRate[], data: string): FxRate | null {
  const limite = new Date(`${data}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - MAX_DIAS_ATRAS);
  const min = limite.toISOString().slice(0, 10);
  let melhor: FxRate | null = null;
  for (const c of cotacoes) {
    if (c.rate_date > data || c.rate_date < min) continue;
    if (!melhor || c.rate_date > melhor.rate_date) melhor = c;
  }
  return melhor;
}

export type Conversao =
  | { ok: true; spend_cents: number; fx_rate: number; fx_rate_date: string | null }
  | { ok: false; motivo: "sem_cotacao" | "moeda_da_org_sem_ptax" };

/** spend_cents fica sempre na moeda da org; é o que telas, CPL, CAC e ROAS leem. */
export function converterGasto(p: {
  centavos: number;
  moedaConta: string;
  moedaOrg: string;
  data: string;
  cotacoes: FxRate[];
}): Conversao {
  if (p.moedaConta === p.moedaOrg) return { ok: true, spend_cents: p.centavos, fx_rate: 1, fx_rate_date: null };
  if (p.moedaOrg !== "BRL") return { ok: false, motivo: "moeda_da_org_sem_ptax" };
  const c = cotacaoDoDia(p.cotacoes, p.data);
  if (!c) return { ok: false, motivo: "sem_cotacao" };
  return { ok: true, spend_cents: Math.round(p.centavos * c.rate_brl), fx_rate: c.rate_brl, fx_rate_date: c.rate_date };
}
