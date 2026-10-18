import { useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { formatarBRL, NOME_FAIXA } from '../../formato';
import type { Conferencia, TeseCatalogo } from './api';
import { CampoCalibracao } from './Campos';
import { ler, mudou, type Calibracao, type Caminho } from './editor';

interface Props {
  atual: Calibracao; publicada: Calibracao | null; onChange: (c: Caminho, v: unknown) => void; disabled: boolean;
}

/** Teses: chances (%), valores, agentes, situações e peso no score, com o "porquê" de cada número (CATALOGO). */
export function SecaoTeses({ catalogo, ...p }: Props & { catalogo: Record<string, TeseCatalogo> }) {
  const [busca, setBusca] = useState('');
  const teses = useMemo(() => Object.entries(catalogo).filter(([, t]) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const textos = [t.nome, ...Object.values(t.probs ?? {}).flatMap((i) => [i.label, i.sub ?? ''])];
    return textos.some((x) => x.toLowerCase().includes(q));
  }), [catalogo, busca]);
  const contaMudancas = (tese: string) => {
    const c = JSON.stringify(ler(p.atual, [tese])) !== JSON.stringify(ler(p.publicada, [tese])) ? 1 : 0;
    return c + (mudou(p.publicada, p.atual, ['_pesos_tese', tese]) ? 1 : 0);
  };
  return (
    <div className="space-y-3">
      <Input placeholder="Buscar tese ou situação (ex.: ponto, testemunha, EPI)" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
      <Accordion type="multiple" className="rounded-md border">
        {teses.map(([k, t]) => (
          <AccordionItem key={k} value={k} className="px-3">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">{t.nome}
                {contaMudancas(k) > 0 && <span className="rounded-full bg-warning/20 px-2 text-xs font-normal">alterada</span>}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              <CampoCalibracao {...p} rotulo="Peso da tese no score" sub="Importância relativa (padrão 1)" caminho={['_pesos_tese', k]} />
              {t.probs && <Grupo titulo="Chances de ganhar">{Object.entries(t.probs).map(([pk, i]) =>
                <CampoCalibracao key={pk} {...p} rotulo={i.label} sub={i.sub} caminho={[k, 'probs', pk]} sufixo="%" />)}</Grupo>}
              {t.valores && <Grupo titulo="Valores de referência">{Object.entries(t.valores).map(([vk, i]) =>
                <CampoCalibracao key={vk} {...p} rotulo={i.label} sub={i.sub} caminho={[k, 'valores', vk]} />)}</Grupo>}
              {t.agentes && <Grupo titulo="Agentes">{Object.entries(t.agentes).map(([ak, i]) => (
                <div key={ak} className="rounded-md border p-2">
                  <p className="text-sm font-medium">{i.label}</p>
                  {i.sub && <p className="text-xs text-muted-foreground">{i.sub}</p>}
                  <Grau {...p} caminho={[k, 'agentes', ak, 'grau']} />
                  <CampoCalibracao {...p} rotulo="Chance" caminho={[k, 'agentes', ak, 'prob']} sufixo="%" />
                  <CampoCalibracao {...p} rotulo={`Chance com EPI (${i.epi ?? 'EPI'})`} caminho={[k, 'agentes', ak, 'prob_epi']} sufixo="%" />
                  {ler(p.atual, [k, 'agentes', ak, 'prob_fora']) !== undefined &&
                    <CampoCalibracao {...p} rotulo={`Chance fora do caso (${i.fora ?? '—'})`} caminho={[k, 'agentes', ak, 'prob_fora']} sufixo="%" />}
                </div>
              ))}</Grupo>}
              {t.situacoes && <Grupo titulo="Situações">{Object.entries(t.situacoes).map(([sk, i]) => (
                <div key={sk} className="rounded-md border p-2">
                  <p className="text-sm font-medium">{i.label}</p>
                  <CampoCalibracao {...p} rotulo="Valor" caminho={[k, 'situacoes', sk, 'valor']} prefixo="R$" />
                  <CampoCalibracao {...p} rotulo="Chance" caminho={[k, 'situacoes', sk, 'prob']} sufixo="%" />
                </div>
              ))}</Grupo>}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="space-y-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>{children}</div>;
}

function Grau({ atual, publicada, onChange, disabled, caminho }: Props & { caminho: Caminho }) {
  const v = ler(atual, caminho) as number;
  return (
    <div className={cn('grid gap-2 p-2 sm:grid-cols-[1fr_140px] sm:items-center', mudou(publicada, atual, caminho) && 'rounded-md bg-warning/10 ring-1 ring-warning/40')}>
      <Label className="text-sm font-medium">Grau</Label>
      <NativeSelect value={String(v)} disabled={disabled} onChange={(e) => onChange(caminho, Number(e.target.value))}
        options={[{ value: '0.1', label: '10% (mínimo)' }, { value: '0.2', label: '20% (médio)' }, { value: '0.4', label: '40% (máximo)' }]} />
    </div>
  );
}

const ROTULO_FAIXA = ['Prata → Ouro', 'Ouro → Titânio', 'Titânio → Diamante'];
const FAIXAS = ['PRATA', 'OURO', 'TITANIO', 'DIAMANTE'] as const;

/** Faixas e comissão + as 10 faixas de score + matriz faixa por valor × faixa de score (calculada no servidor). */
export function SecaoFaixas({ conferencia, ...p }: Props & { conferencia: Conferencia | null }) {
  const score = (ler(p.atual, ['_faixas', 'score_faixas']) ?? []) as { score?: string; mover_faixa: number; pct_comissao: number }[];
  return (
    <div className="space-y-5">
      <Grupo titulo="Limites de valor (a partir de)">
        {ROTULO_FAIXA.map((r, i) => <CampoCalibracao key={i} {...p} rotulo={r} caminho={['_faixas', 'limites', i]} prefixo="R$" />)}
      </Grupo>
      <Grupo titulo="Comissão por faixa">
        {FAIXAS.map((f, i) => <CampoCalibracao key={f} {...p} rotulo={NOME_FAIXA[f]} caminho={['_faixas', 'comissao', i]} prefixo="R$" />)}
      </Grupo>
      <Grupo titulo="Valor que define a faixa">
        <CampoCalibracao {...p} rotulo="Peso do tamanho no valor composto" sub="O resto é a solidez (chance média)" caminho={['_faixas', 'peso_tamanho']} sufixo="%" />
        <div className="grid gap-2 p-2 sm:grid-cols-[1fr_140px] sm:items-center">
          <Label className="text-sm font-medium">Base da faixa</Label>
          <NativeSelect value={String(ler(p.atual, ['_faixas', 'base_faixa']))} disabled={p.disabled} onChange={(e) => p.onChange(['_faixas', 'base_faixa'], e.target.value)}
            options={[{ value: 'composto', label: 'Composto' }, { value: 'bruto', label: 'Bruto' }, { value: 'esperado', label: 'Esperado' }]} />
        </div>
      </Grupo>
      <Grupo titulo="Ajuste pelo score (10 faixas)">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Score</th><th className="p-2">Mover a faixa</th><th className="p-2">% da comissão</th></tr></thead>
            <tbody>
              {score.map((b, i) => (
                <tr key={i} className={cn('border-b last:border-0', (mudou(p.publicada, p.atual, ['_faixas', 'score_faixas', i])) && 'bg-warning/10')}>
                  <td className="p-2 whitespace-nowrap">{b.score ?? `${i * 10}–${i * 10 + 9}%`}</td>
                  <td className="p-2">
                    <NativeSelect value={String(b.mover_faixa)} disabled={p.disabled} onChange={(e) => p.onChange(['_faixas', 'score_faixas', i, 'mover_faixa'], Number(e.target.value))}
                      options={[-3, -2, -1, 0, 1, 2].map((m) => ({ value: String(m), label: m > 0 ? `+${m}` : String(m) }))} />
                  </td>
                  <td className="p-2 w-36"><CampoPct {...p} caminho={['_faixas', 'score_faixas', i, 'pct_comissao']} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Grupo>
      <Grupo titulo="Resultado de cada combinação (faixa por valor × faixa de score)">
        {!conferencia ? <p className="text-sm text-muted-foreground">Calculando…</p> : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead><tr className="border-b"><th className="p-1.5 text-left">Valor \ Score</th>{score.map((b, i) => <th key={i} className="p-1.5 whitespace-nowrap">{b.score ?? `${i * 10}%`}</th>)}</tr></thead>
              <tbody>
                {conferencia.matriz.map((linha, f) => (
                  <tr key={f} className="border-b last:border-0">
                    <th className="p-1.5 text-left whitespace-nowrap">{NOME_FAIXA[FAIXAS[f]]}</th>
                    {linha.map((c, j) => (
                      <td key={j} className="p-1.5 text-center whitespace-nowrap">
                        <span className="block font-medium" style={{ color: `hsl(var(--band-${c.faixa.toLowerCase()}))` }}>{NOME_FAIXA[c.faixa as typeof FAIXAS[number]]}</span>
                        <span className="text-muted-foreground">{c.emRevisao ? 'revisão' : formatarBRL(c.comissao)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Grupo>
    </div>
  );
}

function CampoPct({ caminho, ...p }: Props & { caminho: Caminho }) {
  return <CampoCalibracao {...p} rotulo="" caminho={caminho} sufixo="%" />;
}

/** Geral: selos, salário mínimo e fator de reflexos. */
export function SecaoGeral(p: Props) {
  return (
    <div className="space-y-1">
      <CampoCalibracao {...p} rotulo="Selo forte a partir de" sub="Chance mínima para o selo 'forte'" caminho={['_geral', 'selo_forte']} sufixo="%" />
      <CampoCalibracao {...p} rotulo="Selo média a partir de" sub="Chance mínima para o selo 'média'" caminho={['_geral', 'selo_media']} sufixo="%" />
      <CampoCalibracao {...p} rotulo="Salário mínimo" caminho={['_geral', 'sm']} prefixo="R$" />
      <CampoCalibracao {...p} rotulo="Fator de reflexos" sub="Multiplica as verbas com reflexo (ex.: 1,37)" caminho={['_geral', 'reflexo']} />
    </div>
  );
}
