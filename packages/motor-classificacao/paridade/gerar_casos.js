// Gera casos aleatórios (entrada + calibração) e roda o motor TypeScript compilado (dist/).
// Uso: node paridade/gerar_casos.js <n> <saida.json> [semente]
const M = require('../dist');
const N = +(process.argv[2] || 5000), OUT = process.argv[3] || 'casos.json';
let seed = +(process.argv[4] || 20261016);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const subset = a => a.filter(() => chance(0.4));
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const clone = o => JSON.parse(JSON.stringify(o));

const TESES = Object.keys(M.PERGUNTAS);
const SAIDAS = M.SAIDAS.map(s => s[0]);
const AGENTES = Object.keys(M.CATALOGO.insalubridade.agentes);
const SITS = Object.keys(M.CATALOGO.dano_moral.situacoes);
const NUMS = { he_dia: [0, 0.5, 1, 2, 3, 4], intra_min: [0, 15, 30, 45, 59, 60, 90], not_h: [0, 1, 2, 3, 7], per_dif_base: [0, 100, 300, 800],
  fgts_meses: [0, 1, 6, 12, 24, 70], eq_dif: [0, 150, 500, 1200], pf_valor: [0, 200, 500, 1500], ac_meses_volta: [0, 1, 3, 11, 12, 14],
  do_meses_volta: [0, 1, 3, 11, 12, 14], ge_meses: [0, 1, 3, 5, 8, 9], ge_meses_bebe: [0, 1, 3, 5, 6] };

function opcoesDe(p, r) {
  if (p.id === 'ins_agentes' || p.id === 'ins_epi_ags') return AGENTES;
  if (p.id === 'dano_sits' || p.id === 'dano_provas') return SITS;
  const ops = typeof p.opcoes === 'function' ? p.opcoes(r, {}, M.CALIBRACAO_V1) : p.opcoes;
  return (ops || []).map(o => o[0]);
}
function respostasAleatorias(t) {
  const r = {};
  for (const p of M.PERGUNTAS[t]) {
    if (chance(0.3)) continue; // sem resposta: o motor usa o padrão interno
    if (p.tipo === 'num') r[p.id] = pick(NUMS[p.id] || [0, 1, 2, 5]);
    else if (p.tipo === 'multi') r[p.id] = subset(opcoesDe(p, r));
    else r[p.id] = pick(opcoesDe(p, r));
  }
  return r;
}
function calibracaoAleatoria() {
  const c = clone(M.CALIBRACAO_V1);
  for (const t of TESES) {
    const x = c[t];
    for (const k in x.probs) x.probs[k] = ri(0, 100);
    if (x.valores) for (const k in x.valores) x.valores[k] = Math.round(x.valores[k] * (0.3 + rnd() * 2));
    if (x.situacoes) for (const k in x.situacoes) x.situacoes[k] = { valor: ri(0, 60) * 1000, prob: ri(0, 100) };
    if (x.agentes) for (const a in x.agentes) {
      const g = x.agentes[a]; g.grau = pick([0.1, 0.2, 0.4]); g.prob = ri(0, 100); g.prob_epi = ri(0, 100);
      if (g.prob_fora !== undefined) g.prob_fora = ri(0, 100);
    }
    c._pesos_tese[t] = pick([0, 0.5, 1, 1, 1, 1.5, 2, 3]);
  }
  const l = [ri(5, 80), ri(5, 80), ri(5, 120)].map(v => v * 1000).sort((a, b) => a - b);
  c._faixas = { limites: l, comissao: [ri(0, 100), ri(50, 200), ri(100, 300), ri(150, 500)], peso_tamanho: ri(0, 100),
    base_faixa: pick(['composto', 'bruto', 'esperado']),
    score_faixas: c._faixas.score_faixas.map(b => ({ score: b.score, mover_faixa: ri(-3, 2), pct_comissao: pick([0, 50, 80, 100, 100, 120, 150, 200]) })) };
  c._geral = { selo_forte: ri(40, 90), selo_media: ri(10, 40), sm: ri(1400, 2000), reflexo: +(1 + rnd() * 0.6).toFixed(2) };
  return c;
}
const casos = [];
for (let i = 0; i < N; i++) {
  const teses = chance(0.05) ? TESES.slice() : TESES.filter(() => chance(0.3));
  if (!teses.length) teses.push(pick(TESES));
  teses.sort(() => rnd() - 0.5);
  const saida = pick(SAIDAS);
  const e = {
    salario: pick([1621, 1800, 2500, 3200, 4500, 7000, 12000]), meses: pick([0, 1, 3, 6, 11, 12, 13, 18, 24, 25, 36, 48, 60, 72, 120]),
    funcionarios: pick([3, 10, 20, 21, 30, 150]), diasSemana: pick([0, 5, 6, 7]), saida, local: pick(['interno', 'interno', 'externo']),
    testemunha: chance(0.5), teses, respostas: {},
  };
  if (chance(0.8)) e.jcEmpresaTemProva = chance(0.5);
  if (chance(0.8)) e.riFalta = pick(['doc', 'verbas', 'conduta']);
  if (chance(0.8)) e.vinculoEmpresaAdmite = chance(0.5);
  if (chance(0.8)) e.vinculoTemProva = chance(0.5);
  for (const t of TESES) if (teses.includes(t) ? chance(0.9) : chance(0.15)) e.respostas[t] = respostasAleatorias(t); // inclui resposta "esquecida" de tese desmarcada
  if (chance(0.15)) { e.ajusteManual = {}; e.ajusteManual[pick(teses)] = ri(0, 100); }
  const cal = chance(0.3) ? clone(M.CALIBRACAO_V1) : calibracaoAleatoria();
  casos.push({ id: i, e, cal, ts: M.calcularCaso(e, cal) });
}
require('fs').writeFileSync(OUT, JSON.stringify(casos));
console.log('casos gerados:', casos.length, '→', OUT);
