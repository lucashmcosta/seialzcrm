"""Roda os mesmos casos no protótipo validado (motor_comercial_v3.html) e compara com o motor TypeScript.
Uso: python3 paridade/comparar_v3.py <casos.json> <motor_comercial_v3.html>"""
import json, sys, re, math, os
from playwright.sync_api import sync_playwright

CASOS, HTML = sys.argv[1], os.path.abspath(sys.argv[2])
casos = json.load(open(CASOS))

JS_V3 = r"""
(casos)=>{
  const setChip=(id,v)=>{$(id).querySelectorAll('[data-v]').forEach(c=>c.setAttribute('aria-pressed',String(v!==null&&c.dataset.v===v)));};
  const yn=b=>b===undefined?null:(b?'sim':'nao');
  const out=[];
  for(const c of casos){
    CFG=JSON.parse(JSON.stringify(CFG_PADRAO));BANDS=JSON.parse(JSON.stringify(BANDS_PADRAO));
    GERAL_IDS.forEach(id=>{$(id).value=$(id).defaultValue;});$('base_faixa').value='composto';
    aplicarValores(c.cal);
    const e=c.e;
    $('salario').value=e.salario;$('meses').value=e.meses;$('funcionarios').value=e.funcionarios;$('dias_semana').value=e.diasSemana;$('saida').value=e.saida;
    setChip('local',e.local);setChip('testemunha',e.testemunha?'sim':'nao');
    setChip('jc_prova',yn(e.jcEmpresaTemProva));setChip('ri_falta',e.riFalta===undefined?null:e.riFalta);
    setChip('vinc_admite',yn(e.vinculoEmpresaAdmite));setChip('vinc_doc',yn(e.vinculoTemProva));
    ativas.clear();e.teses.forEach(t=>ativas.add(t));
    for(const k in resp)delete resp[k];
    for(const t in e.respostas)resp[t]=JSON.parse(JSON.stringify(e.respostas[t]));
    for(const t in (e.ajusteManual||{}))(resp[t]=resp[t]||{}).__override=e.ajusteManual[t];
    const G=geral(),B=base();
    const teses=e.teses.map(t=>{const r=calcTese(t,G,B);return {tese:t,bruto:r.bruto,prob:r.prob,probAuto:r.probAuto,esperado:r.esperado,selo:r.selo,aviso:r.aviso,det:r.det};});
    run();
    out.push({id:c.id,teses,tier:$('tier').textContent,comm:$('comm').textContent,score:$('scorebadge').textContent,valor:$('valor').textContent,faixaval:$('faixaval').textContent});
  }
  return out;}
"""
num = lambda s: int(re.sub(r'\D', '', s) or 0)
def perto(a, b):
    a = float("nan") if a is None else a; b = float("nan") if b is None else b
    if a != a or b != b: return (a != a) and (b != b)
    return abs(a - b) <= 1e-6 * max(1, abs(a), abs(b))

difs, n_teses = [], 0
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page()
    erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto('file://' + HTML); pg.evaluate('localStorage.clear()'); pg.reload()
    leve = [{'id': c['id'], 'e': c['e'], 'cal': c['cal']} for c in casos]
    v3 = []
    for i in range(0, len(leve), 400): v3 += pg.evaluate(JS_V3, leve[i:i + 400])
    br.close()
assert not erros, erros
for c, r in zip(casos, v3):
    ts = c['ts']; d = []
    for a, b in zip(ts['teses'], r['teses']):
        n_teses += 1
        for k in ('bruto', 'prob', 'probAuto', 'esperado'):
            if not perto(a[k], b[k]): d.append(f"{a['tese']}.{k}: TS {a[k]} × v3 {b[k]}")
        if a['selo'] != b['selo']: d.append(f"{a['tese']}.selo: TS {a['selo']} × v3 {b['selo']}")
        if a['aviso'] != b['aviso']: d.append(f"{a['tese']}.aviso: TS {a['aviso']!r} × v3 {b['aviso']!r}")
        if a['detalhe'] != b['det']: d.append(f"{a['tese']}.detalhe: TS {a['detalhe']!r} × v3 {b['det']!r}")
    if ts['faixa'] != r['tier']: d.append(f"faixa: TS {ts['faixa']} × v3 {r['tier']}")
    if ts['faixaPorValor'] != r['faixaval']: d.append(f"faixaPorValor: TS {ts['faixaPorValor']} × v3 {r['faixaval']}")
    if ts['comissao'] != (0 if r['comm'] == 'sem comissão' else num(r['comm'])): d.append(f"comissao: TS {ts['comissao']} × v3 {r['comm']}")
    if str(ts['score']) != r['score']: d.append(f"score: TS {ts['score']} × v3 {r['score']}")
    if math.floor(ts['valorFaixa'] + 0.5) != num(r['valor']): d.append(f"valorFaixa: TS {ts['valorFaixa']} × v3 {r['valor']}")
    if d: difs.append((c['id'], d))
from collections import Counter
fx = Counter(c['ts']['faixa'] for c in casos)
print(f"casos: {len(casos)} · teses calculadas: {n_teses} · faixas: {dict(fx)}")
print(f"casos com diferença: {len(difs)}")
for i, d in difs[:15]: print(' caso', i, d[:4])
sys.exit(1 if difs else 0)
