/** Mensagem da rescisão para mandar ao cliente (WhatsApp: *negrito*, _itálico_). */
import { fmtDate, toDate } from './dates';
import type { SeveranceSimulation } from './engine';
import { brl } from './money';
import { TERMINATION_LABEL } from './prescription';

/** Rótulos internos → texto para o cliente. FGTS vai para a conta do FGTS, não para a mão. */
function clientLabel(label: string): string {
  if (label.startsWith('FGTS 8% sobre rescisórias')) return 'FGTS sobre a rescisão (depósito na conta do FGTS)';
  if (label.startsWith('Multa 40% FGTS')) return 'Multa de 40% do FGTS (depósito na conta do FGTS)';
  if (label.startsWith('Multa 20% FGTS')) return 'Multa de 20% do FGTS (depósito na conta do FGTS)';
  return label;
}

export function severanceClientText(sim: SeveranceSimulation, name?: string): string {
  const adm = fmtDate(toDate(sim.admission)!);
  const out = fmtDate(toDate(sim.exit)!);
  const lines = [
    `*Cálculo da sua rescisão*${name ? ` — ${name}` : ''}`,
    `${TERMINATION_LABEL[sim.termination]} · ${adm} a ${out}`,
    `Salário considerado: ${brl(sim.remuneration)}`,
    '',
    ...sim.lines.map((l) => `• ${clientLabel(l.label)}: ${brl(l.value)}`),
    '',
    `*Total que você deveria ter recebido: ${brl(sim.total)}*`,
    '',
    `_Valores estimados e brutos (antes de INSS e IR).${sim.fgtsEstimated ? ' O saldo do FGTS foi estimado pelo salário.' : ''}_`,
  ];
  return lines.join('\n');
}
