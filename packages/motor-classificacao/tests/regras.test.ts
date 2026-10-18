// Regras jurídicas e comerciais validadas (Lucas + Renan, 16/10/2026).
// Cada teste descreve UMA regra. As expectativas leem a calibração, então continuam valendo depois de recalibrar.
import { describe, expect, it } from 'vitest';
import {
  CALIBRACAO_V1, PERGUNTAS, calcularCaso, padraoDe, perguntasVisiveis,
  type Calibracao, type Entrada, type TeseId,
} from '../src';

const CAL = CALIBRACAO_V1 as Calibracao;
const P = (t: TeseId, k: string) => (CAL as any)[t].probs[k] / 100;
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const base = (o: Partial<Entrada> = {}): Entrada => ({
  salario: 2500, meses: 24, funcionarios: 30, diasSemana: 5, saida: 'sem_justa_causa', local: 'interno', testemunha: false,
  teses: [], respostas: {}, ...o,
});
const tese = (e: Entrada, t: TeseId, cal: Calibracao = CAL) => {
  const r = calcularCaso({ ...e, teses: e.teses.includes(t) ? e.teses : [...e.teses, t] }, cal).teses.find(x => x.tese === t);
  if (!r) throw new Error('tese não calculada');
  return r;
};

describe('Testemunha é GLOBAL (pesa em todas as teses em que o cliente prova o fato)', () => {
  it('horas extras com ponto que não mostra o real', () => {
    const e = base({ respostas: { horas_extras: { he_real: 'nao' } } });
    expect(tese(e, 'horas_extras').prob).toBeCloseTo(P('horas_extras', 'fraude_sem_test'));
    expect(tese({ ...e, testemunha: true }, 'horas_extras').prob).toBeCloseTo(P('horas_extras', 'fraude_com_test'));
  });
  it('intervalo pré-assinalado (ponto marca 1h, mas não tirava)', () => {
    const e = base({ respostas: { intrajornada: { intra_registro: 'pre' } } });
    expect(tese(e, 'intrajornada').prob).toBeCloseTo(P('intrajornada', 'pre_sem_test'));
    expect(tese({ ...e, testemunha: true }, 'intrajornada').prob).toBeCloseTo(P('intrajornada', 'pre_test'));
  });
  it('dano moral: sem testemunha e sem documento não entra; com testemunha entra', () => {
    const e = base({ respostas: { dano_moral: { dano_sits: ['assedio'] } } });
    expect(tese(e, 'dano_moral').aviso).toBe('SEM PROVA');
    expect(tese({ ...e, testemunha: true }, 'dano_moral').bruto).toBeGreaterThan(0);
  });
  it('insalubridade (perícia): testemunha só reforça, com teto de 92%', () => {
    const e = base({ respostas: { insalubridade: { ins_agentes: ['biologico'] } } });
    const sem = tese(e, 'insalubridade').prob, com = tese({ ...e, testemunha: true }, 'insalubridade').prob;
    expect(com).toBeCloseTo(Math.min(0.92, sem + P('insalubridade', 'reforco_test')));
  });
});

describe('Corte de 21+ funcionários (art.74 §2º, Súm.338,I) — horas extras, intervalo e noturno', () => {
  const casos: [TeseId, Record<string, string>, string, string][] = [
    ['horas_extras', { he_ponto: 'nao_havia' }, 'sem_ponto_peq', 'forte_sem_ponto'],
    ['intrajornada', { intra_registro: 'nao' }, 'peq_sem_reg', 'interno_sem_reg'],
    ['noturno', { not_ponto: 'nao_havia' }, 'peq_sem_ponto', 'grande_sem_ponto'],
  ];
  for (const [t, r, ate20, mais20] of casos) it(t, () => {
    expect(tese(base({ funcionarios: 20, respostas: { [t]: r } }), t).prob).toBeCloseTo(P(t, ate20));
    expect(tese(base({ funcionarios: 21, respostas: { [t]: r } }), t).prob).toBeCloseTo(P(t, mais20));
  });
});

describe('Trabalho externo (art.62,I): ônus do cliente', () => {
  it('sem ponto: testemunha decide', () => {
    expect(tese(base({ local: 'externo' }), 'horas_extras').prob).toBeCloseTo(P('horas_extras', 'externo_sem_test'));
    expect(tese(base({ local: 'externo', testemunha: true }), 'horas_extras').prob).toBeCloseTo(P('horas_extras', 'externo_test'));
  });
  it('externo COM ponto: a empresa controlava, valem as regras normais', () => {
    const e = base({ local: 'externo', respostas: { horas_extras: { he_ponto: 'relogio' } } });
    expect(tese(e, 'horas_extras').prob).toBeCloseTo(P('horas_extras', 'ponto_real_nao_pagou'));
  });
});

describe('"Já recebe / já pagou" muda o VALOR, não a chance', () => {
  it('horas extras pagas em parte: metade do valor, mesma chance; pagas todas: nada a cobrar', () => {
    const nao = tese(base({ respostas: { horas_extras: { he_pagou: 'nao' } } }), 'horas_extras');
    const parte = tese(base({ respostas: { horas_extras: { he_pagou: 'parte' } } }), 'horas_extras');
    const sim = tese(base({ respostas: { horas_extras: { he_pagou: 'sim' } } }), 'horas_extras');
    expect(parte.bruto).toBeCloseTo(nao.bruto / 2); expect(parte.prob).toBeCloseTo(nao.prob);
    expect(sim.bruto).toBe(0);
  });
  it('insalubridade já recebida no grau devido: nada a cobrar; grau menor: só a diferença', () => {
    const r = { ins_agentes: ['biologico'], ins_recebe: 'sim' };
    expect(tese(base({ respostas: { insalubridade: { ...r, ins_grau_recebe: 'i40' } } }), 'insalubridade').bruto).toBe(0);
    const dif = tese(base({ respostas: { insalubridade: { ...r, ins_grau_recebe: 'i20' } } }), 'insalubridade');
    expect(dif.bruto).toBeCloseTo(0.2 * CAL._geral.sm * 24 * CAL._geral.reflexo);
    expect(dif.prob).toBeCloseTo(P('insalubridade', 'ja_recebe'));
  });
});

describe('Insalubridade × periculosidade são excludentes (art.193 §2º): fica a de maior valor', () => {
  it('a menor sai do total', () => {
    const e = base({ teses: ['insalubridade', 'periculosidade'], respostas: {
      insalubridade: { ins_agentes: ['frio'] }, periculosidade: { per_ativs: ['eletricidade'] } } });
    const r = calcularCaso(e, CAL), ins = r.teses.find(x => x.tese === 'insalubridade')!, per = r.teses.find(x => x.tese === 'periculosidade')!;
    const menor = ins.bruto >= per.bruto ? per : ins, maior = menor === per ? ins : per;
    expect(menor.excluida).toBe(true); expect(maior.excluida).toBe(false);
    expect(r.brutoTotal).toBeCloseTo(maior.bruto);
  });
});

describe('Justa causa: tudo que depende da reversão usa a chance de reverter', () => {
  // gestante com a tese de dano moral marcada (D11) fica só com a indenização → chance = dispensa × reverter
  const e = (prova: boolean, test: boolean) => base({ saida: 'justa_causa', jcEmpresaTemProva: prova, testemunha: test, teses: ['dano_moral'],
    respostas: { dano_moral: { dano_sits: ['assedio'] } } });
  const casos: [boolean, boolean, string][] = [[false, false, 'jc_sem_prova'], [false, true, 'jc_sem_prova_test'], [true, false, 'jc_com_prova'], [true, true, 'jc_com_prova_test']];
  for (const [prova, test, k] of casos) it(`empresa ${prova ? 'com' : 'sem'} prova, ${test ? 'com' : 'sem'} testemunha → ${k}`, () => {
    expect(tese(e(prova, test), 'gestante').prob).toBeCloseTo(Math.max(0.03, Math.min(0.92, P('gestante', 'dispensa') * P('verbas_rescisorias', k))));
  });
});

describe('Rescisão indireta: chance de reconhecer pela falta da empresa', () => {
  const e = (f: Entrada['riFalta'], test: boolean) => base({ saida: 'rescisao_indireta', riFalta: f, testemunha: test, teses: ['dano_moral'],
    respostas: { dano_moral: { dano_sits: ['assedio'] } } });
  const R = (k: string) => P('verbas_rescisorias', k), disp = P('gestante', 'dispensa');
  it('atraso de salário/FGTS (documental) + reforço da testemunha', () => {
    expect(tese(e('doc', false), 'gestante').prob).toBeCloseTo(disp * R('ri_doc'));
    expect(tese(e('doc', true), 'gestante').prob).toBeCloseTo(disp * Math.min(0.92, R('ri_doc') + R('ri_reforco_test')));
  });
  it('assédio/conduta: depende da testemunha', () => {
    expect(tese(e('conduta', false), 'gestante').prob).toBeCloseTo(Math.max(0.03, disp * R('ri_conduta')));
    expect(tese(e('conduta', true), 'gestante').prob).toBeCloseTo(disp * R('ri_conduta_test'));
  });
});

describe('Sem registro: a chance do vínculo pesa em TODAS as teses', () => {
  const R = (k: string) => P('verbas_rescisorias', k);
  const casos: [boolean, boolean, boolean, string][] = [
    [true, false, false, 'vinc_admite'], [true, false, true, 'vinc_admite_test'], [false, false, false, 'vinc_nega_nada'],
    [false, true, false, 'vinc_nega_doc'], [false, false, true, 'vinc_nega_test'], [false, true, true, 'vinc_nega_doc_test']];
  for (const [adm, doc, test, k] of casos) it(`${k}`, () => {
    const e = base({ testemunha: test, respostas: { horas_extras: { he_ponto: 'nao_havia' } } });
    const normal = tese(e, 'horas_extras').prob;
    const sr = tese({ ...e, saida: 'sem_registro', vinculoEmpresaAdmite: adm, vinculoTemProva: doc }, 'horas_extras').prob;
    expect(sr).toBeCloseTo(normal * R(k));
  });
  it('FGTS sem registro usa o período todo (sem perguntar meses)', () => {
    const r = tese(base({ saida: 'sem_registro', vinculoEmpresaAdmite: true, meses: 30 }), 'fgts');
    expect(r.bruto).toBeCloseTo(0.08 * 2500 * 30 * 1.4);
  });
  it('salário por fora não se aplica (o salário inteiro já é por fora)', () => {
    expect(tese(base({ saida: 'sem_registro' }), 'por_fora').aviso).toBe('NÃO SE APLICA');
  });
});

describe('Multa do art.477: 10 dias para pagar E entregar as guias', () => {
  const e = (prazo: string) => base({ respostas: { verbas_rescisorias: { resc: 'tudo', prazo477: prazo } } });
  it('tudo em dia: nada a cobrar', () => expect(tese(e('sim'), 'verbas_rescisorias').bruto).toBe(0));
  it('pagou em dia mas as guias atrasaram: 1 salário com a chance própria', () => {
    const r = tese(e('guias'), 'verbas_rescisorias');
    expect(r.bruto).toBeCloseTo(2500); expect(r.prob).toBeCloseTo(P('verbas_rescisorias', 'multa477_guias'));
  });
});

describe('FGTS: multa de 40% só onde a saída dá direito', () => {
  it('pedido de demissão: só os depósitos', () => {
    const r = tese(base({ saida: 'pedido_demissao', respostas: { fgts: { fgts_meses: 10 } } }), 'fgts');
    expect(r.bruto).toBeCloseTo(0.08 * 2500 * 10);
  });
  it('dispensa sem justa causa: depósitos + 40%', () => {
    const r = tese(base({ respostas: { fgts: { fgts_meses: 10 } } }), 'fgts');
    expect(r.bruto).toBeCloseTo(0.08 * 2500 * 10 * 1.4);
  });
});

describe('Gestante', () => {
  const g = (o: Partial<Entrada>, r: Record<string, unknown> = {}) =>
    tese(base({ teses: ['dano_moral'], respostas: { dano_moral: { dano_sits: ['assedio'] }, gestante: r as any }, ...o }), 'gestante');
  it('Tema 134 TST: a recusa de voltar ao emprego não pesa — não existe essa pergunta', () => {
    expect(PERGUNTAS.gestante.some(p => /recus|retorn|voltar/i.test(String(p.rotulo)))).toBe(false);
  });
  it('Tema 163 TST: contrato de experiência tem a mesma estabilidade da dispensa', () => {
    expect(g({}, { ge_contrato: 'experiencia' }).prob).toBeCloseTo(g({}, { ge_contrato: 'normal' }).prob);
  });
  it('temporária (Lei 6.019) é controversa: chance própria', () => {
    expect(g({}, { ge_contrato: 'temporario' }).prob).toBeCloseTo(P('gestante', 'temporaria_2026'));
  });
  it('pedido de demissão sem sindicato é inválido (art.500)', () => {
    expect(g({ saida: 'pedido_demissao' }).prob).toBeCloseTo(P('gestante', 'pedido_sem_sind'));
  });
  it('bebê com 5 meses ou mais na saída: fora da estabilidade', () => {
    expect(g({}, { ge_momento: 'nasceu', ge_meses_bebe: 5 }).aviso).toBe('FORA DA ESTABILIDADE');
  });
  it('D11: com a tese de dano moral marcada, o dano moral da gestante não é contado de novo', () => {
    const sem = tese(base(), 'gestante'), com = g({});
    expect(sem.bruto - com.bruto).toBeCloseTo((CAL as any).gestante.valores.dm);
  });
});

describe('Acidente e doença: estabilidade (art.118)', () => {
  const estab = (t: TeseId, r: Record<string, unknown>) => tese(base({ respostas: { [t]: r as any } }), t);
  it('acidente típico SEM afastamento do INSS não tem estabilidade (Súm.378,II)', () => {
    expect(estab('acidente', { ac_estab: 'sim' }).bruto).toBeCloseTo(estab('acidente', { ac_estab: 'nao' }).bruto);
  });
  it('acidente com B91: chance cheia; com B31: chance de converter', () => {
    const b91 = estab('acidente', { ac_inss: 'b91', ac_estab: 'sim', ac_meses_volta: 3 }).detalhe;
    const b31 = estab('acidente', { ac_inss: 'b31', ac_estab: 'sim', ac_meses_volta: 3 }).detalhe;
    expect(b91).toContain(`estabilidade 9 meses (B91) R$`); expect(b91).toContain(`(${Math.round(P('acidente', 'estab_b91') * 100)}%)`);
    expect(b31).toContain(`(${Math.round(P('acidente', 'estab_b31') * 100)}%)`);
  });
  it('doença SEM afastamento: Tema 125 — indeniza 12 meses com a chance do nexo', () => {
    const d = estab('doenca', { do_estab: 'sim' }).detalhe;
    expect(d).toContain('estabilidade 12 meses (Tema 125: nexo depois da saída)');
    expect(d).toContain(`(${Math.round(P('doenca', 'estab_nexo_t125') * 100)}%)`);
  });
  it('pensão não entra', () => expect(estab('acidente', { ac_grav: 'grave' }).detalhe).toContain('pensão não entra'));
});

describe('Classificação do caso: faixa, score e comissão', () => {
  const e = base({ teses: ['horas_extras', 'fgts'], respostas: { horas_extras: { he_pagou: 'nao' } } });
  it('valor composto = bruto × (peso do tamanho + (1 − peso) × solidez)', () => {
    const r = calcularCaso(e, CAL), pT = CAL._faixas.peso_tamanho / 100;
    expect(r.valorComposto).toBeCloseTo(r.brutoTotal * (pT + (1 - pT) * r.solidez));
    expect(r.score).toBe(Math.round(r.solidez * 100));
  });
  it('faixa pelo valor nos limites da calibração', () => {
    const cal = clone(CAL); cal._faixas.base_faixa = 'bruto';
    const r = calcularCaso(e, cal), [l1, l2, l3] = cal._faixas.limites;
    const n = r.brutoTotal > l3 ? 3 : r.brutoTotal > l2 ? 2 : r.brutoTotal > l1 ? 1 : 0;
    expect(r.faixa).toBe(['PRATA', 'OURO', 'TITANIO', 'DIAMANTE'][n]);
    expect(r.comissao).toBe(cal._faixas.comissao[n]);
  });
  it('faixa de score pode subir a faixa (sem passar de Diamante)', () => {
    const cal = clone(CAL); cal._faixas.score_faixas = cal._faixas.score_faixas.map(b => ({ ...b, mover_faixa: 2 }));
    const antes = calcularCaso(e, CAL), depois = calcularCaso(e, cal), F = ['PRATA', 'OURO', 'TITANIO', 'DIAMANTE'];
    expect(F.indexOf(depois.faixa!)).toBe(Math.min(3, F.indexOf(antes.faixa!) + 2));
  });
  it('faixa de score com 0% de comissão manda para revisão do jurídico', () => {
    const cal = clone(CAL); cal._faixas.score_faixas = cal._faixas.score_faixas.map(b => ({ ...b, pct_comissao: 0 }));
    const r = calcularCaso(e, cal);
    expect(r.comissao).toBe(0); expect(r.emRevisao).toBe(true);
  });
  it('a ordem em que as teses foram marcadas não muda nada', () => {
    const a = calcularCaso(e, CAL), b = calcularCaso({ ...e, teses: [...e.teses].reverse() }, CAL);
    expect([b.faixa, b.comissao, b.score]).toEqual([a.faixa, a.comissao, a.score]);
  });
  it('sem tese marcada não classifica', () => expect(calcularCaso(base(), CAL).faixa).toBeNull());
  it('aviso que trava: insalubridade sem agente marcado entra em "falta preencher"', () => {
    const r = calcularCaso(base({ teses: ['insalubridade'] }), CAL);
    expect(r.faltaPreencher).toEqual([{ tese: 'insalubridade', aviso: 'MARQUE OS AGENTES' }]);
  });
  it('ajuste manual do gestor troca a chance e guarda a automática', () => {
    const r = calcularCaso({ ...e, ajusteManual: { horas_extras: 40 } }, CAL).teses.find(x => x.tese === 'horas_extras')!;
    expect(r.prob).toBe(0.4); expect(r.ajusteManual).toBe(true); expect(r.probAuto).toBeCloseTo(P('horas_extras', 'ponto_real_nao_pagou'));
  });
});

describe('Calibração extrema não quebra o cálculo (sem NaN)', () => {
  it('chance-base da gestante em 0% com contrato temporário', () => {
    const cal = clone(CAL); (cal as any).gestante.probs.dispensa = 0;
    expect(Number.isFinite(calcularCaso(base({ teses: ['gestante'], respostas: { gestante: { ge_contrato: 'temporario' } } }), cal).score)).toBe(true);
  });
  it('estabilidade B91 em 0%', () => {
    const cal = clone(CAL); (cal as any).doenca.probs.estab_b91 = 0; (cal as any).doenca.probs.estab_nexo_t125 = 0;
    expect(Number.isFinite(calcularCaso(base({ teses: ['doenca'], respostas: { doenca: { do_estab: 'sim' } } }), cal).score)).toBe(true);
  });
  it('situação de dano moral calibrada com valor 0', () => {
    const cal = clone(CAL); (cal as any).dano_moral.situacoes.assedio.valor = 0;
    const r = calcularCaso(base({ testemunha: true, teses: ['dano_moral'], respostas: { dano_moral: { dano_sits: ['assedio'] } } }), cal);
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('O que a tela mostra marcado é o que o motor calcula', () => {
  // para toda pergunta visível, deixar sem resposta = responder o padrão mostrado
  const ctxs = (['sem_justa_causa', 'rescisao_indireta', 'pedido_demissao', 'sem_registro', 'justa_causa'] as const)
    .flatMap(saida => (['interno', 'externo'] as const).flatMap(local => [false, true].map(testemunha => ({ saida, local, testemunha }))));
  let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const respostaAleatoria = (t: TeseId) => { // respostas parciais variadas, para abrir as perguntas condicionais
    const r: Record<string, any> = {};
    for (const p of PERGUNTAS[t]) {
      if (rnd() < 0.4) continue;
      const ops = typeof p.opcoes === 'function' ? p.opcoes(r, {} as any, CAL) : p.opcoes;
      if (p.id === 'ins_agentes' || p.id === 'ins_epi_ags') r[p.id] = ['biologico', 'ruido', 'poeira', 'frio'].filter(() => rnd() < 0.5);
      else if (p.id === 'dano_sits' || p.id === 'dano_provas') r[p.id] = ['assedio', 'jc_improbidade', 'informalidade'].filter(() => rnd() < 0.5);
      else if (p.tipo === 'num') r[p.id] = [0, 1, 3, 6, 13][Math.floor(rnd() * 5)];
      else if (ops?.length) r[p.id] = ops[Math.floor(rnd() * ops.length)][0];
    }
    return r;
  };
  for (const t of Object.keys(PERGUNTAS) as TeseId[]) it(t, () => {
    let conferidas = 0;
    for (const c of ctxs) for (let i = 0; i < 40; i++) {
      const r = respostaAleatoria(t), e = base({ ...c, meses: 30, teses: [t], respostas: { [t]: r } });
      const ctx = { saida: e.saida, local: e.local, meses: e.meses, testemunha: e.testemunha, teses: e.teses };
      for (const p of perguntasVisiveis(t, r, ctx)) {
        if (p.tipo === 'multi') continue;
        const sem = { ...r }; delete sem[p.id];
        if (!perguntasVisiveis(t, sem, ctx).includes(p)) continue;
        const a = calcularCaso({ ...e, respostas: { [t]: sem } }, CAL).teses[0];
        const b = calcularCaso({ ...e, respostas: { [t]: { ...sem, [p.id]: padraoDe(p, ctx) } } }, CAL).teses[0];
        expect([b.bruto, b.prob, b.aviso], `${t}.${p.id} ${JSON.stringify(c)} ${JSON.stringify(sem)}`).toEqual([a.bruto, a.prob, a.aviso]);
        conferidas++;
      }
    }
    if (PERGUNTAS[t].some(p => p.tipo !== 'multi')) expect(conferidas).toBeGreaterThan(100); // dano moral só tem marcação múltipla
  });
  it('cobre as perguntas que só aparecem depois de outra resposta (ex.: grau que já recebe)', () => {
    const ctx = { saida: 'sem_justa_causa' as const, local: 'interno' as const, meses: 30, testemunha: false, teses: ['insalubridade' as TeseId] };
    const p = PERGUNTAS.insalubridade.find(x => x.id === 'ins_grau_recebe')!;
    expect(perguntasVisiveis('insalubridade', { ins_recebe: 'sim' }, ctx)).toContain(p);
    expect(padraoDe(p, ctx)).toBe('i20');
  });
});

describe('Pendências do vendedor = avisos que travam no motor', () => {
  it('nos 400 casos-ouro, a tela trava exatamente quando o motor trava', async () => {
    const { pendenciaDaTese, AVISOS_BLOQUEANTES } = await import('../src');
    const ouro = (await import('./casos-ouro.json')).default as any;
    let n = 0;
    for (const c of ouro.casos) c.esperado.teses.forEach((x: any) => {
      const trava = pendenciaDaTese(x.tese, c.entrada.respostas[x.tese] ?? {}) !== '';
      expect(trava, `${c.id} ${x.tese}`).toBe(AVISOS_BLOQUEANTES.includes(x.aviso)); n++;
    });
    expect(n).toBeGreaterThan(1000);
  });
});
