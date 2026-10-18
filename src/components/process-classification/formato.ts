import type { Faixa } from './api';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatarBRL = (v: number) => brl.format(v);

/** "18/10/2026 às 14:05" */
export function dataHora(iso: string): string {
  const d = new Date(iso);
  const dd = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dd} às ${hh}`;
}

export const NOME_FAIXA: Record<Faixa, string> = { PRATA: 'Prata', OURO: 'Ouro', TITANIO: 'Titânio', DIAMANTE: 'Diamante' };

/** Mensagem por faixa (§5.4). */
export const MENSAGEM_FAIXA: Record<Faixa, [string, string]> = {
  PRATA: ['Bom trabalho!', 'Mais uma venda no seu mês.'],
  OURO: ['Mandou bem!', 'Venda de qualidade.'],
  TITANIO: ['Excelente venda!', 'Caso forte e bem fechado.'],
  DIAMANTE: ['Venda espetacular!', 'Esse é dos grandes.'],
};

/** Faíscas da revelação (§5.4). */
export const FAISCAS: Record<Faixa, number> = { PRATA: 18, OURO: 18, TITANIO: 24, DIAMANTE: 30 };

/** Cor de destaque da faixa: token claro/escuro do design system (src/index.css, --band-*). */
export const corFaixa = (f: Faixa) => `hsl(var(--band-${f.toLowerCase()}))`;

export const rotuloOportunidade = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
