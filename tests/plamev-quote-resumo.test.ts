import { describe, expect, it } from 'vitest';
import { resumoParaCliente } from '../src/widgets/plamev-quote/resumo';

const resultado = {
  mensalidade: 359.98, totalMensalidade: 331.48, descontosMensalidade: -28.5, adesao: 331.48, fidelidadeAte: '2027-11-02',
  composicaoMensalidade: [
    { nome: 'Mensalidade Plano ADVANCE PLUS Pet Rex', valor: 179.99 },
    { nome: 'Desconto 2° Pet (Mia)', valor: -8.5 },
  ],
  composicaoAdesao: [{ nome: 'Desconto 2° Pet (Mia)', valor: -8.5 }],
};

describe('resumo da cotação Plamev', () => {
  it('lista pets, valores, pagamento e descontos sem repetir', () => {
    const t = resumoParaCliente({
      resultado, formaPagamento: 2, numeroCotacao: '98765',
      pets: [{ nome: 'Rex', plano: 'Advance Plus' }, { nome: '', plano: 'Advance Plus' }],
    });
    expect(t).toContain('Cotação Plamev nº 98765');
    expect(t).toContain('• Pet 2: plano Advance Plus');
    expect(t).toMatch(/Mensalidade: R\$\s?331,48 \(de R\$\s?359,98\)/);
    expect(t).toContain('Pagamento: cartão de crédito');
    expect(t).toContain('Fidelidade até 02/11/2027');
    expect(t.match(/Desconto 2° Pet/g)).toHaveLength(1);
  });
  it('sem desconto não mostra "de" nem a seção de descontos', () => {
    const t = resumoParaCliente({
      resultado: { ...resultado, descontosMensalidade: 0, composicaoMensalidade: [], composicaoAdesao: [] },
      formaPagamento: 1, numeroCotacao: null, pets: [{ nome: 'Mia', plano: 'Slim' }],
    });
    expect(t.startsWith('Cotação Plamev\n')).toBe(true);
    expect(t).not.toContain('(de ');
    expect(t).not.toContain('Descontos aplicados');
    expect(t).toContain('Pagamento: boleto');
    expect(t).not.toContain('Para contratar');
  });
  it('com cotação gravada, termina com o link de pagamento', () => {
    const link = 'https://cliente.plamev.com.br/pagamento/checkout/NzY4MTI5NjMtNDdBOC02Njk4LUI3M0YtRUM3OTE3OTJCMjA1/';
    const t = resumoParaCliente({
      resultado: { ...resultado, linkPagamento: link }, formaPagamento: 2, numeroCotacao: '202611000000020-01',
      pets: [{ nome: 'Max', plano: 'Advance' }],
    });
    expect(t.endsWith(`Para contratar, é só pagar por aqui:\n${link}`)).toBe(true);
  });
});
