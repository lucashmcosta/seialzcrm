import type { Resultado } from './api';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto para o vendedor colar no WhatsApp/e-mail do cliente. Sem dados pessoais além do nome do pet. */
export function resumoParaCliente({ resultado, pets, formaPagamento, numeroCotacao }: {
  resultado: Resultado;
  pets: { nome: string; plano: string }[];
  formaPagamento: 1 | 2;
  numeroCotacao: string | null;
}): string {
  const linhasPets = pets.map((p, i) => `• ${p.nome || `Pet ${i + 1}`}: plano ${p.plano}`);
  const descontos = [...resultado.composicaoMensalidade, ...resultado.composicaoAdesao]
    .filter((l) => l.valor < 0)
    .map((l) => l.nome)
    .filter((n, i, a) => a.indexOf(n) === i);
  const fidelidade = resultado.fidelidadeAte
    ? `Fidelidade até ${new Date(`${resultado.fidelidadeAte}T12:00:00`).toLocaleDateString('pt-BR')}`
    : null;
  return [
    numeroCotacao ? `Cotação Plamev nº ${numeroCotacao}` : 'Cotação Plamev',
    '',
    ...linhasPets,
    '',
    `Mensalidade: ${brl(resultado.totalMensalidade)}${resultado.descontosMensalidade < 0 ? ` (de ${brl(resultado.mensalidade)})` : ''}`,
    `Adesão (1ª cobrança): ${brl(resultado.adesao)}`,
    `Pagamento: ${formaPagamento === 2 ? 'cartão de crédito' : 'boleto'}`,
    ...(fidelidade ? [fidelidade] : []),
    ...(descontos.length ? ['', 'Descontos aplicados:', ...descontos.map((d) => `• ${d}`)] : []),
  ].join('\n');
}
