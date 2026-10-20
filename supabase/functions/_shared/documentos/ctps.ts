export interface VinculoCtps {
  cnpj: string;
  empregador: string | null;
  periodo: string | null;
  /** Contrato ainda em aberto -- nunca prescreve enquanto estiver assim. */
  atual: boolean;
  /** Fim do contrato, ISO. Null quando em aberto ou ilegível. */
  fim: string | null;
  /** Data em que a ação prescreve, contada do FIM do contrato. */
  prescreve_em: string | null;
  dentro_do_prazo: boolean;
  /** Negativo quando já prescreveu. Serve para avisar de prazo apertado. */
  dias_para_prescrever: number | null;
}

/**
 * Prazo para ajuizar, contado do fim do contrato. O padrão é 24 meses (a
 * prescrição bienal trabalhista), mas vem por parâmetro porque é regra de uma
 * área do direito, não do produto.
 *
 * ATENÇÃO: isto ORDENA a lista, não decide o caso. A bienal tem exceções --
 * FGTS, doença ocupacional (conta da ciência da lesão, não do fim do
 * contrato), menor de 18 anos (não corre), ação já ajuizada. Por isso o que
 * está fora do prazo continua visível e selecionável: esconder bloquearia
 * caso legítimo e ninguém entenderia o motivo.
 */
function calcularPrazo(
  periodo: string | null,
  atual: boolean,
  mesesPrescricao: number,
  hoje: Date,
): Pick<VinculoCtps, "fim" | "prescreve_em" | "dentro_do_prazo" | "dias_para_prescrever"> {
  if (atual) {
    return { fim: null, prescreve_em: null, dentro_do_prazo: true, dias_para_prescrever: null };
  }
  const bruto = periodo?.split(/\s*-\s*/)[1]?.trim();
  const m = bruto?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) {
    // Sem data legível não dá para afirmar que prescreveu: na dúvida, fica na
    // lista de cima e a pessoa decide.
    return { fim: null, prescreve_em: null, dentro_do_prazo: true, dias_para_prescrever: null };
  }
  const fim = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const limite = new Date(fim);
  limite.setMonth(limite.getMonth() + mesesPrescricao);
  const dias = Math.round((limite.getTime() - hoje.getTime()) / 86_400_000);
  return {
    fim: fim.toISOString().slice(0, 10),
    prescreve_em: limite.toISOString().slice(0, 10),
    dentro_do_prazo: dias >= 0,
    dias_para_prescrever: dias,
  };
}

/**
 * Os vínculos da CTPS digital. O texto vem como
 *   "<período> Empregador <NOME> CNPJ RAIZ: … Estabelecimento <NOME> CNPJ: <completo> <endereço>"
 * e é isso que a gente aproveita: nome e período já vêm ao lado do número, e
 * é o que a pessoa precisa para saber qual é o caso.
 */
export function vinculosDaCtps(
  texto: string,
  cnpjValido: (c: string) => boolean,
  opcoes: { mesesPrescricao?: number; hoje?: Date } = {},
): VinculoCtps[] {
  const mesesPrescricao = opcoes.mesesPrescricao ?? 24;
  const hoje = opcoes.hoje ?? new Date();
  const out: VinculoCtps[] = [];
  const vistos = new Set<string>();
  const partes = texto.split(/\bEmpregador\b/g);
  for (let i = 1; i < partes.length; i++) {
    const bruto = partes[i];
    const bloco = bruto.replace(/\s+/g, " ").trim();
    const mCnpj = bloco.match(/CNPJ:\s*(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/);
    if (!mCnpj) continue;
    const cnpj = mCnpj[1].replace(/\D/g, "");
    if (cnpj.length !== 14 || !cnpjValido(cnpj) || vistos.has(cnpj)) continue;
    vistos.add(cnpj);
    const nome = bloco.split(/\s+CNPJ RAIZ/)[0]?.trim() || null;
    // o período fica ANTES da palavra "Empregador", no fim do trecho anterior
    // O último período do trecho anterior. Não pode exigir que esteja no fim:
    // em vínculo com aviso prévio indenizado vem um "Data da projeção …"
    // depois dele. O formato de FAIXA é o que distingue do resto.
    const todos = (partes[i - 1] ?? "").replace(/\s+/g, " ").match(
      /\d{2}\/\d{2}\/\d{4}\s*-\s*(?:\d{2}\/\d{2}\/\d{4}|Aberto)/gi,
    );
    const periodo = todos?.[todos.length - 1]?.trim() ?? null;
    const atual = /aberto/i.test(periodo ?? "");
    out.push({
      cnpj,
      empregador: nome && nome.length < 120 ? nome : null,
      periodo,
      atual,
      ...calcularPrazo(periodo, atual, mesesPrescricao, hoje),
    });
  }
  return out;
}
