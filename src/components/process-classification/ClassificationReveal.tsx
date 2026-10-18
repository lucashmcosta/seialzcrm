import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import prata from './materiais/prata.svg?raw';
import ouro from './materiais/ouro.svg?raw';
import titanio from './materiais/titanio.svg?raw';
import diamante from './materiais/diamante.svg?raw';
import type { Faixa } from './api';
import { FAISCAS, MENSAGEM_FAIXA, NOME_FAIXA, corFaixa, dataHora, formatarBRL, rotuloOportunidade } from './formato';
import './classificacao.css';

// SVGs estáticos do pacote (IDs internos únicos por material, podem coexistir na página).
const SVG: Record<Faixa, string> = { PRATA: prata, OURO: ouro, TITANIO: titanio, DIAMANTE: diamante };

interface Rajada { id: number; dirs: { x: number; y: number }[] }

/** Direções sorteadas uma vez por rajada (não mudam a cada render). */
function rajada(id: number, n: number): Rajada {
  return {
    id,
    dirs: Array.from({ length: n }, (_, i) => {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 70 + Math.random() * 50;
      return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist };
    }),
  };
}

function Faiscas({ rajadas, cor, onFim }: { rajadas: Rajada[]; cor: string; onFim: (id: number) => void }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {rajadas.map((r) => (
        <div key={r.id}>
          {r.dirs.map((d, i) => (
            <motion.i key={i} className="absolute left-1/2 top-1/2 -ml-[3.5px] -mt-[3.5px] h-[7px] w-[7px] rounded-full"
              style={{ background: cor }}
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 1 }}
              animate={{ x: d.x, y: d.y, scale: 1, opacity: 0 }}
              transition={{ duration: 1.15, ease: 'easeOut' }}
              onAnimationComplete={i === 0 ? () => onFim(r.id) : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Material da faixa. Com animação: entra girando, flutua, solta faíscas e pula ao toque. */
export function Material({ faixa, animar, tamanho = 168 }: { faixa: Faixa; animar: boolean; tamanho?: number }) {
  const cor = corFaixa(faixa);
  const [rajadas, setRajadas] = useState<Rajada[]>(() => (animar ? [rajada(1, FAISCAS[faixa])] : []));
  const [pulo, setPulo] = useState(0);
  const seq = useRef(1);
  const pular = () => {
    if (!animar) return;
    setPulo((p) => p + 1);
    setRajadas((r) => [...r, rajada(++seq.current, 16)]);
  };
  const img = <div className="pc-material h-full w-full" dangerouslySetInnerHTML={{ __html: SVG[faixa] }} />;

  if (!animar) {
    return <div className="pc-material pc-estatico mx-auto" style={{ width: tamanho, height: tamanho }} aria-hidden>{img}</div>;
  }
  return (
    <div className="relative mx-auto grid place-items-center" style={{ width: tamanho + 52, height: tamanho + 32 }}>
      <motion.div className="absolute inset-[18px] rounded-full" aria-hidden
        style={{ background: `radial-gradient(circle, ${cor} 0%, transparent 66%)` }}
        animate={{ opacity: [0.18, 0.36, 0.18], scale: [0.92, 1.05, 0.92] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div animate={{ y: [0, -7, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
        <motion.button type="button" onClick={pular} aria-label={`Material ${NOME_FAIXA[faixa]}`}
          className="block cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ width: tamanho, height: tamanho, transformPerspective: 500, filter: 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.35))' }}
          initial={{ rotateY: -540, scale: 0.2, opacity: 0 }}
          animate={pulo === 0
            ? { rotateY: [-540, 20, 0], scale: [0.2, 1.1, 1], opacity: [0, 1, 1] }
            : { y: [0, -22, 0, 0], rotate: [0, 8, -3, 0], scale: [1, 1.1, 1, 1] }}
          transition={pulo === 0
            ? { duration: 1, times: [0, 0.7, 1], ease: [0.2, 0.9, 0.3, 1.25] }
            : { duration: 0.55, times: [0, 0.35, 0.7, 1], ease: [0.3, 1.6, 0.5, 1] }}
          key={pulo}
          whileHover={{ rotate: -7, scale: 1.07 }}>
          {img}
        </motion.button>
      </motion.div>
      <Faiscas rajadas={rajadas} cor={cor} onFim={(id) => setRajadas((r) => r.filter((x) => x.id !== id))} />
    </div>
  );
}

function Comissao({ valor, animar }: { valor: number; animar: boolean }) {
  const [mostrado, setMostrado] = useState(animar ? 0 : valor);
  const [pulso, setPulso] = useState(false);
  useEffect(() => {
    if (!animar) { setMostrado(valor); return; }
    const c = animate(0, valor, {
      duration: 1.1, delay: 0.9, ease: 'easeOut',
      onUpdate: (v) => setMostrado(v),
      onComplete: () => setPulso(true),
    });
    return () => c.stop();
  }, [valor, animar]);
  return (
    <motion.b className="block text-3xl font-extrabold tabular-nums text-success dark:text-success-foreground"
      animate={pulso ? { scale: [1, 1.18, 1] } : undefined} transition={{ duration: 0.5 }}>
      + {formatarBRL(Math.round(mostrado * 100) / 100)}
    </motion.b>
  );
}

const surge = (animar: boolean, delay: number) => (animar
  ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay } }
  : {});

/** Revelação do resultado (§5.4). Ao reabrir (animar=false) ou com reduced motion, mostra direto. */
export function ClassificationReveal({ faixa, comissao, classificadoEm, opportunityId, animar, paraVendedor = true }: {
  faixa: Faixa; comissao: number; classificadoEm: string; opportunityId: string; animar: boolean;
  /** false = gestor/jurídico vendo a classificação de outra pessoa: sem "sua comissão" nem parabéns. */
  paraVendedor?: boolean;
}) {
  const reduzir = useReducedMotion();
  const a = animar && !reduzir;
  const [titulo, sub] = MENSAGEM_FAIXA[faixa];
  return (
    <div className="text-center">
      <Material faixa={faixa} animar={a} tamanho={a ? 168 : 112} />
      <motion.p className="mt-2 text-xl" {...surge(a, 0.5)}>
        Este é um processo <strong style={{ color: corFaixa(faixa) }}>{NOME_FAIXA[faixa]}</strong>
      </motion.p>
      <motion.div className="mx-auto mt-4 inline-grid gap-0.5 rounded-xl border bg-background px-6 py-3" {...surge(a, 0.8)}>
        <small className="text-[11px] uppercase tracking-wider text-muted-foreground">{paraVendedor ? 'Sua comissão desta venda' : 'Comissão do vendedor'}</small>
        <Comissao valor={comissao} animar={a} />
      </motion.div>
      {paraVendedor && (
        <motion.p className="mt-3 text-base font-semibold" {...surge(a, 1.1)}>
          {titulo}
          <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{sub}</span>
        </motion.p>
      )}
      <motion.p className="mt-3 text-xs text-muted-foreground" {...surge(a, 1.3)}>
        Classificado em {dataHora(classificadoEm)} · Oportunidade {rotuloOportunidade(opportunityId)}
      </motion.p>
    </div>
  );
}
