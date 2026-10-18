"""Confere que as perguntas do pacote (perguntas.ts) são as mesmas do assistente validado (widget_vendedor.html):
mesma ordem, quando aparecem, texto, opções e valor que já vem marcado. Uso: python3 paridade/comparar_perguntas.py <casos.json> <widget_vendedor.html>"""
import json, sys, subprocess, os
from playwright.sync_api import sync_playwright
CASOS, HTML = sys.argv[1], os.path.abspath(sys.argv[2])
aqui = os.path.dirname(os.path.abspath(__file__))
NODE = r"""
const M=require(process.argv[1]+'/../dist');const casos=require(process.argv[2]);const out=[];
for(const c of casos){const e=c.e;const ctx={saida:e.saida,local:e.local,meses:e.meses,testemunha:e.testemunha,teses:e.teses};
  for(const t of Object.keys(M.PERGUNTAS)){const r=(e.respostas[t]||{});
    out.push({id:c.id,t,v:M.perguntasVisiveis(t,r,ctx).map(p=>({id:p.id,tipo:p.tipo,
      rotulo:typeof p.rotulo==='function'?p.rotulo(r,ctx):p.rotulo,
      ops:(typeof p.opcoes==='function'?p.opcoes(r,ctx,c.cal):(p.opcoes||[])).map(o=>o.join('=')),
      padrao:M.padraoDe(p,ctx)}))});}}
process.stdout.write(JSON.stringify(out));"""
casos = json.load(open(CASOS))[:3000]
tmp = os.path.join(aqui, '_casos_perg.json'); json.dump([{'id': c['id'], 'e': c['e'], 'cal': c['cal']} for c in casos], open(tmp, 'w'))
ts = json.loads(subprocess.run(['node', '-e', NODE, aqui, tmp], capture_output=True, text=True, check=True).stdout); os.remove(tmp)
JS = r"""
(casos)=>{const out=[];
  const setChip=(id,v)=>{$(id).querySelectorAll('[data-v]').forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.v===v)));};
  for(const c of casos){const e=c.e;setChip('testemunha',e.testemunha?'sim':'nao');
    const B={saida:e.saida,meses:e.meses,local:e.local,test:e.testemunha};
    for(const t of Object.keys(TESES)){const r=e.respostas[t]||{};
      out.push({id:c.id,t,v:TESES[t].perg.filter(p=>!p.cond||p.cond(r,B)).map(p=>{const ops=(p.opsFn?p.opsFn(r):(p.ops||[]));
        return {id:p.id,tipo:p.tipo,rotulo:p.labelFn?p.labelFn(r,B):p.label,ops:ops.map(o=>o.join('=')),
          padrao:p.tipo==='multi'?[]:(p.defFn?p.defFn(B):(p.val!==undefined?p.val:(p.ops?p.ops[0][0]:'')))};})});}}
  return out;}"""
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(); pg.goto('file://' + HTML)
    wd = []
    for i in range(0, len(casos), 500): wd += pg.evaluate(JS, [{'id': c['id'], 'e': c['e']} for c in casos[i:i + 500]])
    br.close()
difs = [(a['id'], a['t'], a['v'], b['v']) for a, b in zip(ts, wd) if a != b]
print(f"telas de tese comparadas: {len(ts)} · perguntas mostradas: {sum(len(a['v']) for a in ts)} · diferenças: {len(difs)}")
for d in difs[:5]:
    for x, y in zip(d[2], d[3]):
        if x != y: print(' caso', d[0], d[1], '\n  pacote:', x, '\n  widget:', y); break
    else: print(' caso', d[0], d[1], 'qtd', len(d[2]), len(d[3]), [x['id'] for x in d[2]], [y['id'] for y in d[3]])
sys.exit(1 if difs else 0)
